import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HISTORY_DAYS, LabService, STALE_MS } from './lab.service';
import type { LabSnapshot } from './lab.types';

const TOKEN = 'a-long-enough-lab-ingest-token-0123456789';
const NOW = Date.parse('2026-10-15T19:42:30Z');

const snapshot = (
  at = NOW,
  change: Partial<LabSnapshot> = {},
): LabSnapshot => ({
  takenAt: new Date(at).toISOString(),
  machines: [
    { id: 'poseidon', up: true, cpu: 8, uptimeSeconds: 1_036_800 },
    { id: 'optimus', up: false },
  ],
  services: [
    { id: 'umami', status: 'up', latencyMs: 41 },
    { id: 'n8n', status: 'down' },
    { id: 'odysseus', status: 'maintenance' },
  ],
  ...change,
});

describe('LabService', () => {
  let dir: string;

  const build = (env: Record<string, string> = {}) =>
    new LabService({
      get: (key: string) =>
        ({
          LAB_ENABLED: 'true',
          LAB_INGEST_TOKEN: TOKEN,
          LAB_NODES: 'poseidon, optimus,umami,n8n,odysseus,tunnel',
          DATA_DIR: dir,
          ...env,
        })[key],
    } as unknown as ConfigService);

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lab-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('configuration', () => {
    it('is off by default, and reports only that', async () => {
      const off = build({ LAB_ENABLED: '' });
      expect(off.enabled).toBe(false);
      expect(await off.report()).toEqual({ configured: false });
      expect(off.health()).toEqual({
        unit: 'lab',
        state: 'inactive',
        reason: 'unconfigured',
      });
    });

    it('counts a short token as unset', () => {
      expect(build({ LAB_INGEST_TOKEN: 'x'.repeat(31) }).enabled).toBe(false);
      expect(build({ LAB_INGEST_TOKEN: 'x'.repeat(32) }).enabled).toBe(true);
    });
  });

  describe('the token', () => {
    it('lets the right bearer in', () => {
      expect(build().authorised(`Bearer ${TOKEN}`)).toBe(true);
    });

    it.each([
      ['missing', undefined],
      ['wrong', 'Bearer not-the-token-not-the-token-not-it'],
      ['the token without the scheme', TOKEN],
      ['empty', 'Bearer '],
    ])('refuses one that is %s', (_, header) => {
      expect(build().authorised(header)).toBe(false);
    });

    it('stays locked when the server has no token, whatever is sent', () => {
      expect(build({ LAB_INGEST_TOKEN: '' }).authorised('Bearer ')).toBe(false);
      expect(
        build({ LAB_INGEST_TOKEN: 'short' }).authorised('Bearer short'),
      ).toBe(false);
    });

    it('stays locked when the feed is off, even with the right token', () => {
      expect(
        build({ LAB_ENABLED: 'false' }).authorised(`Bearer ${TOKEN}`),
      ).toBe(false);
    });
  });

  describe('ingest', () => {
    it('keeps known ids and names the ones it dropped', async () => {
      const lab = build();
      const result = await lab.ingest(
        snapshot(NOW, {
          machines: [
            { id: 'poseidon', up: true },
            { id: 'poseidonn', up: true },
          ],
          services: [{ id: 'vaultwarden', status: 'up' }],
        }),
        NOW,
      );
      expect(result).toEqual({
        accepted: 1,
        dropped: ['poseidonn', 'vaultwarden'],
      });
      const report = await lab.report(NOW);
      expect(report.configured && report.snapshot?.machines).toEqual([
        { id: 'poseidon', up: true },
      ]);
      expect(report.configured && report.snapshot?.services).toEqual([]);
    });

    it.each([
      ['eleven minutes behind', NOW - 11 * 60_000],
      ['eleven minutes ahead', NOW + 11 * 60_000],
    ])('refuses a snapshot taken %s', async (_, at) => {
      await expect(build().ingest(snapshot(at), NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('takes one nine minutes behind', async () => {
      await expect(
        build().ingest(snapshot(NOW - 9 * 60_000), NOW),
      ).resolves.toMatchObject({ accepted: 5 });
    });

    it('refuses the same id twice', async () => {
      await expect(
        build().ingest(
          snapshot(NOW, {
            machines: [
              { id: 'poseidon', up: true },
              { id: 'poseidon', up: false },
            ],
          }),
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('report', () => {
    it('says configured with nothing yet before the first push', async () => {
      expect(await build().report(NOW)).toEqual({
        configured: true,
        receivedAt: null,
        ageMs: null,
        stale: true,
        snapshot: null,
        history: {},
      });
    });

    it('is fresh just after a push, and stale five minutes on', async () => {
      const lab = build();
      await lab.ingest(snapshot(), NOW);
      expect(await lab.report(NOW + 1_000)).toMatchObject({
        ageMs: 1_000,
        stale: false,
        receivedAt: new Date(NOW).toISOString(),
      });
      expect(await lab.report(NOW + STALE_MS)).toMatchObject({ stale: false });
      expect(await lab.report(NOW + STALE_MS + 1)).toMatchObject({
        stale: true,
      });
    });
  });

  describe('the daily rollup', () => {
    const history = async (lab: LabService, at: number) => {
      const report = await lab.report(at);
      return report.configured ? report.history : {};
    };

    it('is thirty days per node, oldest first, with null for no data', async () => {
      const lab = build();
      await lab.ingest(snapshot(), NOW);
      const bars = await history(lab, NOW);
      expect(bars.poseidon).toHaveLength(HISTORY_DAYS);
      expect(bars.poseidon.slice(0, -1).every((d) => d === null)).toBe(true);
      expect(bars.poseidon.at(-1)).toBe(1);
      expect(bars.optimus.at(-1)).toBe(0);
      // Maintenance is planned, not an outage.
      expect(bars.odysseus.at(-1)).toBe(1);
      expect(bars.n8n.at(-1)).toBe(0);
    });

    it('splits at UTC midnight, leaving a day nothing saw as null', async () => {
      const lab = build();
      const beforeMidnight = Date.parse('2026-10-13T23:59:30Z');
      await lab.ingest(snapshot(beforeMidnight), beforeMidnight);
      await lab.ingest(
        snapshot(beforeMidnight, {
          machines: [{ id: 'poseidon', up: false }],
        }),
        beforeMidnight + 10_000,
      );
      const twoDaysOn = Date.parse('2026-10-15T00:00:30Z');
      await lab.ingest(snapshot(twoDaysOn), twoDaysOn);

      const bars = await history(lab, twoDaysOn);
      // The 13th: one up, one down. The 14th: nothing at all. The 15th: up.
      expect(bars.poseidon.slice(-3)).toEqual([0.5, null, 1]);
    });

    it('forgets a day once it is thirty days old', async () => {
      const lab = build();
      await lab.ingest(snapshot(), NOW);
      const later = NOW + HISTORY_DAYS * 86_400_000;
      await lab.ingest(snapshot(later), later);
      const bars = await history(lab, later);
      expect(bars.poseidon.filter((d) => d !== null)).toEqual([1]);
    });

    it('counts the tunnel when the lab lists it', async () => {
      const lab = build();
      await lab.ingest(
        snapshot(NOW, { tunnel: { healthy: false, connections: 0 } }),
        NOW,
      );
      expect((await history(lab, NOW)).tunnel.at(-1)).toBe(0);
    });
  });

  describe('persistence', () => {
    it('survives a restart through DATA_DIR/lab.json', async () => {
      await build().ingest(snapshot(), NOW);
      const fresh = build();
      const report = await fresh.report(NOW + 2_000);
      expect(report).toMatchObject({
        configured: true,
        ageMs: 2_000,
        snapshot: { machines: [{ id: 'poseidon' }, { id: 'optimus' }] },
      });
    });

    it('writes nothing but what visitors read', async () => {
      await build().ingest(snapshot(), NOW);
      const file = JSON.parse(
        await readFile(join(dir, 'lab.json'), 'utf8'),
      ) as object;
      expect(Object.keys(file).sort()).toEqual([
        'days',
        'receivedAt',
        'snapshot',
      ]);
    });

    it('ignores a file that is not the right shape', async () => {
      await writeFile(join(dir, 'lab.json'), '{"receivedAt":"soon"}', 'utf8');
      expect(await build().report(NOW)).toMatchObject({ snapshot: null });
    });
  });

  describe('health', () => {
    it('reads the age of what it holds and how many nodes it maps', async () => {
      const lab = build();
      expect(lab.health(NOW)).toEqual({
        unit: 'lab',
        state: 'active',
        cacheAge: null,
        detail: { nodes: 6 },
      });
      await lab.ingest(snapshot(), NOW);
      expect(lab.health(NOW + 42_000)).toMatchObject({ cacheAge: 42_000 });
    });
  });
});
