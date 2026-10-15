import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  askFailure,
  classify,
  reasonOf,
  type AskFault,
  type AskReason,
} from './ask.failure';

/**
 * The reason table, one row per case: what a fault looks like from the API and the name
 * it is given. `refused` is the row this exists for: a Cloudflare rule that stopped
 * admitting the API looks exactly like a 403 from here.
 */
describe('classify', () => {
  const rows: Array<[string, AskFault, AskReason]> = [
    ['ASK_ENABLED off', { kind: 'disabled' }, 'unconfigured'],
    ['the slot is taken', { kind: 'busy' }, 'busy'],
    ['a detached load still running', { kind: 'warming' }, 'warming'],
    [
      'a refused connection',
      {
        kind: 'thrown',
        error: Object.assign(new TypeError('fetch failed'), {
          cause: { code: 'ECONNREFUSED' },
        }),
      },
      'unreachable',
    ],
    [
      'a DNS failure',
      { kind: 'thrown', error: new Error('ENOTFOUND') },
      'unreachable',
    ],
    ['the edge answering 403', { kind: 'status', status: 403 }, 'refused'],
    ['the edge answering 401', { kind: 'status', status: 401 }, 'refused'],
    ['Cloudflare’s 524', { kind: 'status', status: 524 }, 'upstream'],
    ['the runtime’s 500', { kind: 'status', status: 500 }, 'upstream'],
    ['the tunnel’s 502', { kind: 'status', status: 502 }, 'upstream'],
    ['the 20 s deadline', { kind: 'deadline' }, 'timeout'],
    ['a stream with no words', { kind: 'empty' }, 'empty'],
    ['the controller’s ceiling', { kind: 'ceiling' }, 'silent'],
  ];

  it.each(rows)('%s reads as %s', (_case, fault, reason) => {
    expect(classify(fault)).toBe(reason);
  });

  it('keeps a reason an error already carries', () => {
    expect(
      classify({
        kind: 'thrown',
        error: askFailure('refused', 'The model answered 403'),
      }),
    ).toBe('refused');
  });
});

describe('askFailure', () => {
  it('keeps the status each failure always had, and adds the reason to the body', () => {
    const busy = askFailure('busy', 'One question at a time');
    expect(busy).toBeInstanceOf(ServiceUnavailableException);
    expect(busy.getResponse()).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'One question at a time',
      reason: 'busy',
    });

    const refused = askFailure('refused', 'The model answered 403');
    expect(refused).toBeInstanceOf(BadGatewayException);
    expect(refused.getStatus()).toBe(502);
    expect(reasonOf(refused)).toBe('refused');
  });

  it('reads no reason off an error that has none', () => {
    expect(reasonOf(new Error('boom'))).toBeUndefined();
    expect(reasonOf({ reason: 'made-up' })).toBeUndefined();
    expect(reasonOf(null)).toBeUndefined();
  });
});
