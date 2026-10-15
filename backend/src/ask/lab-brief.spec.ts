import type { LabReport, LabSnapshot } from '../lab/lab.types';
import { labBrief, MAX_LAB_BRIEF_CHARS } from './lab-brief';
import { systemPrompt } from './prompt';

const SNAPSHOT: LabSnapshot = {
  takenAt: '2026-10-15T19:42:01.000Z',
  machines: [
    {
      id: 'poseidon',
      up: true,
      uptimeSeconds: 12 * 86_400 + 3_600,
      cpu: 8.1,
      memory: 41,
      gpu: { util: 3, vramUsedMb: 2150, vramTotalMb: 10240 },
      pools: [{ name: 'tank', health: 'ONLINE', used: 0.61 }],
    },
    {
      id: 'optimus',
      up: true,
      uptimeSeconds: 30 * 86_400,
      cpu: 2.4,
      pools: [{ name: 'data', health: 'ONLINE', used: 0.744 }],
    },
  ],
  services: [
    { id: 'umami', status: 'up', latencyMs: 41 },
    { id: 'n8n', status: 'down' },
  ],
  models: {
    runtime: 'up',
    resident: [{ name: 'gemma4:e4b', vramMb: 2100 }],
    installed: Array.from({ length: 6 }, (_, i) => ({
      name: `m${i}`,
      sizeGb: 1,
    })),
  },
};

const report = (
  ageMs: number,
  snapshot: LabSnapshot | null = SNAPSHOT,
): LabReport => ({
  configured: true,
  receivedAt: '2026-10-15T19:42:02.000Z',
  ageMs,
  stale: ageMs > 5 * 60_000,
  snapshot,
  history: {},
});

describe('labBrief', () => {
  it('writes one line per machine and one for the models, under the snapshot’s age', () => {
    expect(labBrief(report(40_000))).toBe(
      [
        'LAB NOW (snapshot 40 s old):',
        'poseidon: up 12 days, CPU 8 %, memory 41 %, GPU 3 % (2.1 of 10 GB VRAM), pool tank ONLINE 61 % full',
        'optimus: up 30 days, CPU 2 %, pool data ONLINE 74 % full',
        'models loaded: gemma4:e4b; installed: 6',
        'services not up: n8n (down)',
      ].join('\n'),
    );
  });

  it('says a stale snapshot may be out of date', () => {
    expect(labBrief(report(3 * 3_600_000))!.split('\n')[0]).toBe(
      'LAB NOW (last seen 3 h ago, may be out of date):',
    );
  });

  it('says nothing with the lab off, or before the first push', () => {
    expect(labBrief({ configured: false })).toBeNull();
    expect(labBrief(report(0, null))).toBeNull();
    expect(labBrief(null)).toBeNull();
  });

  it('stays under its cap, dropping whole lines and never the heading', () => {
    const crowded: LabSnapshot = {
      ...SNAPSHOT,
      machines: Array.from({ length: 8 }, (_, i) => ({
        ...SNAPSHOT.machines[0],
        id: `machine-with-a-long-name-${i}`,
        pools: Array.from({ length: 8 }, (__, j) => ({
          name: `pool${j}`,
          health: 'ONLINE' as const,
          used: 0.5,
        })),
      })),
    };
    const brief = labBrief(report(40_000, crowded))!;
    expect(brief.length).toBeLessThanOrEqual(MAX_LAB_BRIEF_CHARS);
    expect(brief.startsWith('LAB NOW (snapshot 40 s old):')).toBe(true);
    expect(brief.split('\n').every((line) => !line.endsWith(','))).toBe(true);
  });

  it('adds the rule about measurements only when the block is there', () => {
    const withLab = systemPrompt({
      corpus: '# llms',
      labNow: labBrief(report(40_000)),
      locale: 'en',
    });
    expect(withLab).toContain(
      'Facts under LAB NOW are measurements at the age stated',
    );
    expect(withLab).toContain('LAB NOW (snapshot 40 s old):');
    const without = systemPrompt({
      corpus: '# llms',
      labNow: labBrief({ configured: false }),
      locale: 'en',
    });
    expect(without).not.toContain('LAB NOW');
  });
});
