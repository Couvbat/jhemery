import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
  registerDecorator,
  ValidateNested,
} from 'class-validator';
import type {
  GpuSample,
  LabSnapshot,
  MachineSample,
  ModelSample,
  PoolHealth,
  PoolSample,
  ServiceSample,
  ServiceStatus,
} from './lab.types';

/**
 * The snapshot's schema, and the second of the two places the lab map's "never shown"
 * list is enforced (the agent's `snapshot.mjs` is the first). It publishes facts about a
 * private network, so every number is bounded, every array capped, every string held to
 * a pattern, and no string may look like an address. The route that takes it refuses
 * unknown properties rather than stripping them: silence would hide an agent that has
 * started sending something it shouldn't.
 */

/** A node id: `poseidon`, `npm`. */
export const NODE_ID = /^[a-z0-9-]{1,32}$/;
/** A pool or model name: `tank`, `gemma4:e4b`, `library/qwen3:8b`. */
export const SAMPLE_NAME = /^[A-Za-z0-9._:/-]{1,64}$/;

/**
 * What an address looks like, in any of the forms that could leak one: a dotted quad,
 * an IPv6 address (compressed or in full), a URL, a `host:port` pair, or a name in one of
 * the private suffixes. The port rule is a name followed by a colon and digits *only*, so
 * a model tag such as `gemma4:e4b` or `qwen2.5:7b` still passes. `lab-agent/address.mjs`
 * holds the same list, and both are held to `lab-agent/fixtures/near-misses.json`.
 */
export const ADDRESS_PATTERNS: readonly RegExp[] = [
  // Bounded by what can't continue the number, not by `\b`: a letter or an underscore
  // beside it is a word character too, so `backup_192.168.1.20` had no boundary to match.
  /(?<!\d)\d{1,3}(?:\.\d{1,3}){3}(?!\d)/,
  /::/,
  /(?<![0-9a-f])[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){7}(?![0-9a-f])/i,
  /:\/\//,
  /[a-z0-9-]+(?:\.[a-z0-9-]+)*:\d{1,5}(?![\w.:])/i,
  /\.(?:lan|local|home\.arpa|ts\.net)\b/i,
];

export function looksLikeAddress(value: string): boolean {
  return ADDRESS_PATTERNS.some((pattern) => pattern.test(value));
}

function NotAnAddress(): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'notAnAddress',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} must not look like an address`,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value !== 'string' || !looksLikeAddress(value),
      },
    });
  };
}

const POOL_HEALTH: PoolHealth[] = [
  'ONLINE',
  'DEGRADED',
  'FAULTED',
  'OFFLINE',
  'UNAVAIL',
];
const SERVICE_STATUS: ServiceStatus[] = ['up', 'down', 'maintenance'];

/** Generous ceilings: they exist to refuse nonsense, not to describe this lab. */
const MAX_UPTIME_S = 10 * 365 * 86_400;
const MAX_VRAM_MB = 262_144;

class TempDto {
  @IsOptional()
  @IsNumber()
  @Min(-40)
  @Max(150)
  cpu?: number;

  @IsOptional()
  @IsNumber()
  @Min(-40)
  @Max(150)
  gpu?: number;
}

class PoolDto implements PoolSample {
  @Matches(SAMPLE_NAME)
  @NotAnAddress()
  name: string;

  @IsOptional()
  @IsIn(POOL_HEALTH)
  health?: PoolHealth;

  @IsNumber()
  @Min(0)
  @Max(1)
  used: number;
}

class GpuDto implements GpuSample {
  @IsNumber()
  @Min(0)
  @Max(100)
  util: number;

  @IsNumber()
  @Min(0)
  @Max(MAX_VRAM_MB)
  vramUsedMb: number;

  @IsNumber()
  @Min(0)
  @Max(MAX_VRAM_MB)
  vramTotalMb: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2_000)
  powerW?: number;
}

class MachineDto implements MachineSample {
  @Matches(NODE_ID)
  id: string;

  @IsBoolean()
  up: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UPTIME_S)
  uptimeSeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  cpu?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  memory?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000)
  load?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TempDto)
  tempC?: TempDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PoolDto)
  pools?: PoolDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => GpuDto)
  gpu?: GpuDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000)
  containers?: number;
}

class ServiceDto implements ServiceSample {
  @Matches(NODE_ID)
  id: string;

  @IsIn(SERVICE_STATUS)
  status: ServiceStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(600_000)
  latencyMs?: number;
}

class ResidentModelDto {
  @Matches(SAMPLE_NAME)
  @NotAnAddress()
  name: string;

  @IsNumber()
  @Min(0)
  @Max(MAX_VRAM_MB)
  vramMb: number;
}

class InstalledModelDto {
  @Matches(SAMPLE_NAME)
  @NotAnAddress()
  name: string;

  @IsNumber()
  @Min(0)
  @Max(4_096)
  sizeGb: number;
}

class ModelDto implements ModelSample {
  @IsIn(['up', 'down'])
  runtime: 'up' | 'down';

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ResidentModelDto)
  resident: ResidentModelDto[];

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InstalledModelDto)
  installed: InstalledModelDto[];
}

class TunnelDto {
  @IsBoolean()
  healthy: boolean;

  @IsInt()
  @Min(0)
  @Max(64)
  connections: number;
}

export class LabSnapshotDto implements LabSnapshot {
  /** The skew check (10 minutes) is the service's: it needs the API's clock. */
  @IsISO8601({ strict: true })
  takenAt: string;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => MachineDto)
  machines: MachineDto[];

  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => ServiceDto)
  services: ServiceDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ModelDto)
  models?: ModelDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TunnelDto)
  tunnel?: TunnelDto;
}
