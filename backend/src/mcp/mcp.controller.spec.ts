import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

/** The transport rules; the protocol itself is `mcp.service.spec.ts`'s. */
describe('McpController', () => {
  let service: { enabled: boolean; handle: jest.Mock };
  let controller: McpController;
  let res: { status: jest.Mock; setHeader: jest.Mock };

  beforeEach(() => {
    service = {
      enabled: true,
      handle: jest.fn((m: { id?: number }) =>
        Promise.resolve(
          m.id === undefined ? null : { jsonrpc: '2.0', id: m.id, result: {} },
        ),
      ),
    };
    controller = new McpController(service as unknown as McpService);
    res = { status: jest.fn(), setHeader: jest.fn() };
  });

  const response = () => res as unknown as Response;

  it('answers a request with its response', async () => {
    expect(
      await controller.post(
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        response(),
      ),
    ).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('acknowledges a notification with 202 and no body', async () => {
    expect(
      await controller.post(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        response(),
      ),
    ).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('answers a batch with the responses only', async () => {
    const out = await controller.post(
      [
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'ping' },
      ],
      response(),
    );
    expect(out).toHaveLength(2);
  });

  it('refuses a GET or DELETE with 405 and says to POST', () => {
    controller.stream(response());
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    controller.endSession(response());
    expect(res.setHeader).toHaveBeenCalledTimes(2);
  });

  it('is simply not there while switched off', async () => {
    service.enabled = false;
    await expect(
      controller.post({ jsonrpc: '2.0', id: 1, method: 'ping' }, response()),
    ).rejects.toThrow(NotFoundException);
    expect(() => controller.stream(response())).toThrow(NotFoundException);
    expect(service.handle).not.toHaveBeenCalled();
  });
});
