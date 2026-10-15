import { ValidationPipe } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LabSnapshotDto, looksLikeAddress } from './lab.dto';

/**
 * The schema the route holds a push to, through the same pipe options the controller
 * uses, so "refused" here means a 400 there.
 */
const FIXTURES = join(__dirname, '..', '..', '..', 'lab-agent', 'fixtures');
const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as T;

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
});
const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: LabSnapshotDto });

type Snapshot = Record<string, unknown> & {
  machines: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
};
const full = (): Snapshot => fixture<Snapshot>('expected-snapshot.json');

describe('LabSnapshotDto', () => {
  it('accepts the snapshot the agent makes from its fixtures', async () => {
    await expect(validate(full())).resolves.toBeDefined();
  });

  it('accepts the smallest snapshot: a time and two empty lists', async () => {
    await expect(
      validate({
        takenAt: new Date().toISOString(),
        machines: [],
        services: [],
      }),
    ).resolves.toBeDefined();
  });

  /** Each a near miss of a real push, each held to a 400. */
  const nearMisses: Array<[string, (s: Snapshot) => void]> = [
    [
      'an IP in a pool name',
      (s) => {
        s.machines[0].pools = [
          { name: '192.168.1.20', health: 'ONLINE', used: 0.5 },
        ];
      },
    ],
    [
      'a host and port as a model name',
      (s) => {
        s.models = {
          runtime: 'up',
          resident: [{ name: 'npm.lan:81', vramMb: 1 }],
          installed: [],
        };
      },
    ],
    [
      'a URL as a model name',
      (s) => {
        s.models = {
          runtime: 'up',
          resident: [],
          installed: [{ name: 'http://ollama', sizeGb: 1 }],
        };
      },
    ],
    [
      'an IPv6 address in a pool name',
      (s) => {
        s.machines[0].pools = [{ name: 'fe80::1', used: 0.5 }];
      },
    ],
    [
      'a private suffix in a pool name',
      (s) => {
        s.machines[0].pools = [{ name: 'tank.home.arpa', used: 0.5 }];
      },
    ],
    [
      'a fill past 1 by a sixth decimal place',
      (s) => {
        s.machines[0].pools = [
          { name: 'tank', health: 'ONLINE', used: 1.000001 },
        ];
      },
    ],
    [
      'a CPU past 100 %',
      (s) => {
        s.machines[0].cpu = 100.5;
      },
    ],
    [
      'a negative latency',
      (s) => {
        s.services[0].latencyMs = -1;
      },
    ],
    [
      'an id with a dot in it',
      (s) => {
        s.machines[0].id = 'poseidon.lan';
      },
    ],
    [
      'an unknown property: a hostname',
      (s) => {
        s.machines[0].hostname = 'poseidon';
      },
    ],
    [
      'an unknown property at the top',
      (s) => {
        s.version = '2.11.3';
      },
    ],
    [
      'a pool health nobody knows',
      (s) => {
        s.machines[0].pools = [{ name: 'tank', health: 'HAPPY', used: 0.5 }];
      },
    ],
    [
      'nine machines',
      (s) => {
        s.machines = Array.from({ length: 9 }, (_, i) => ({
          id: `m${i}`,
          up: true,
        }));
      },
    ],
    [
      'twenty-one installed models',
      (s) => {
        s.models = {
          runtime: 'up',
          resident: [],
          installed: Array.from({ length: 21 }, (_, i) => ({
            name: `m${i}`,
            sizeGb: 1,
          })),
        };
      },
    ],
    [
      'a time that is not a time',
      (s) => {
        s.takenAt = 'yesterday';
      },
    ],
    [
      'a number as a string',
      (s) => {
        s.machines[0].cpu = '8';
      },
    ],
  ];

  it.each(nearMisses)('refuses %s', async (_, change) => {
    const body = full();
    change(body);
    await expect(validate(body)).rejects.toMatchObject({ status: 400 });
  });

  it('names an unknown property in the 400', async () => {
    const body = full();
    body.machines[0].hostname = 'poseidon';
    await expect(validate(body)).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          expect.stringContaining('hostname should not exist'),
        ]) as unknown,
      },
    });
  });
});

describe('looksLikeAddress', () => {
  // The agent's tests read the same file, so the two copies of the rules agree.
  const { refused, accepted } = fixture<{
    refused: string[];
    accepted: string[];
  }>('near-misses.json');

  it.each(refused)('refuses %s', (name) => {
    expect(looksLikeAddress(name)).toBe(true);
  });

  it.each(accepted)('lets %s through', (name) => {
    expect(looksLikeAddress(name)).toBe(false);
  });
});
