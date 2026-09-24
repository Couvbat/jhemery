import { Controller, Get } from '@nestjs/common';
import { AskService } from '../ask/ask.service';
import type { HealthReport, UnitHealth } from '../common/health';
import { ContactService } from '../contact/contact.service';
import { GithubService } from '../github/github.service';
import { GuestbookService } from '../guestbook/guestbook.service';
import { JobsService } from '../jobs/jobs.service';
import { MarketsService } from '../markets/markets.service';
import { McpService } from '../mcp/mcp.service';
import { PresenceService } from '../presence/presence.service';
import { RoomsService } from '../rooms/rooms.service';
import { StatsService } from '../stats/stats.service';
import { SteamService } from '../steam/steam.service';
import { WeatherService } from '../weather/weather.service';

/** Anything with the `health()` every feature service implements. */
interface HasHealth {
  health(): UnitHealth;
}

/**
 * `GET /health` — what the terminal's `systemctl status` prints. It collects each
 * module's own `health()`, which reads only what that service already holds (see
 * `common/health.ts`), so this route costs no upstream call and never wakes anything
 * on a visitor's behalf. Units are listed in a fixed order so the terminal's table
 * does not shuffle between runs.
 */
@Controller('health')
export class HealthController {
  private readonly units: HasHealth[];

  constructor(
    steam: SteamService,
    github: GithubService,
    weather: WeatherService,
    markets: MarketsService,
    presence: PresenceService,
    stats: StatsService,
    guestbook: GuestbookService,
    rooms: RoomsService,
    jobs: JobsService,
    ask: AskService,
    contact: ContactService,
    mcp: McpService,
  ) {
    this.units = [
      steam,
      github,
      weather,
      markets,
      presence,
      stats,
      guestbook,
      rooms,
      jobs,
      ask,
      contact,
      mcp,
    ];
  }

  @Get()
  report(): HealthReport {
    return {
      uptime: Math.round(process.uptime()),
      units: this.units.map((unit) => unit.health()),
    };
  }
}
