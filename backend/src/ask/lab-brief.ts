import type { LabReport, LabSnapshot, MachineSample } from '../lab/lab.types';

/**
 * The lab, as the model reads it: a `LAB NOW` block in the system prompt
 * (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md` §1). One line per machine
 * and one for the models, ending with the snapshot's age, at most 1 200 characters. It
 * holds only what `GET /lab` already publishes, so the blast radius stays nil.
 */

export const MAX_LAB_BRIEF_CHARS = 1_200;

/** `40 s`, `3 min`, `3 h`, `2 d`. */
export function ago(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function uptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  if (days >= 2) return `${days} days`;
  const hours = Math.floor(seconds / 3_600);
  return hours >= 1 ? `${hours} h` : `${Math.floor(seconds / 60)} min`;
}

const pct = (n: number) => `${Math.round(n)} %`;
const gb = (mb: number) => {
  const value = mb / 1024;
  return value >= 10
    ? String(Math.round(value))
    : String(Math.round(value * 10) / 10);
};

function machineLine(machine: MachineSample): string {
  if (!machine.up) return `${machine.id}: down`;
  const parts = [
    ...(machine.uptimeSeconds !== undefined
      ? [`up ${uptime(machine.uptimeSeconds)}`]
      : ['up']),
    ...(machine.cpu !== undefined ? [`CPU ${pct(machine.cpu)}`] : []),
    ...(machine.memory !== undefined ? [`memory ${pct(machine.memory)}`] : []),
    ...(machine.gpu
      ? [
          `GPU ${pct(machine.gpu.util)} (${gb(machine.gpu.vramUsedMb)} of ${gb(machine.gpu.vramTotalMb)} GB VRAM)`,
        ]
      : []),
    ...(machine.pools ?? []).map(
      (pool) =>
        `pool ${pool.name}${pool.health ? ` ${pool.health}` : ''} ${pct(pool.used * 100)} full`,
    ),
  ];
  return `${machine.id}: ${parts.join(', ')}`;
}

function modelsLine(snapshot: LabSnapshot): string | null {
  const models = snapshot.models;
  if (!models) return null;
  if (models.runtime !== 'up') return 'models: the runtime is down';
  const loaded =
    models.resident.map((model) => model.name).join(', ') || 'none';
  return `models loaded: ${loaded}; installed: ${models.installed.length}`;
}

function servicesLine(snapshot: LabSnapshot): string | null {
  const notUp = snapshot.services.filter((service) => service.status !== 'up');
  if (!notUp.length) return null;
  return `services not up: ${notUp.map((service) => `${service.id} (${service.status})`).join(', ')}`;
}

/** The block, or null when there is nothing to say: the lab off, or nothing pushed yet. */
export function labBrief(report: LabReport | null | undefined): string | null {
  if (!report?.configured || !report.snapshot) return null;
  const age = ago(report.ageMs ?? 0);
  const heading = report.stale
    ? `LAB NOW (last seen ${age} ago, may be out of date):`
    : `LAB NOW (snapshot ${age} old):`;
  const lines = [
    heading,
    ...report.snapshot.machines.map(machineLine),
    modelsLine(report.snapshot),
    servicesLine(report.snapshot),
  ].filter((line): line is string => !!line);

  // Whole lines only, from the bottom, so the heading and its age always survive.
  while (lines.join('\n').length > MAX_LAB_BRIEF_CHARS && lines.length > 1)
    lines.pop();
  return lines.join('\n').slice(0, MAX_LAB_BRIEF_CHARS);
}
