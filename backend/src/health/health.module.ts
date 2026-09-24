import { Module } from '@nestjs/common';
import { AskModule } from '../ask/ask.module';
import { ContactModule } from '../contact/contact.module';
import { GithubModule } from '../github/github.module';
import { GuestbookModule } from '../guestbook/guestbook.module';
import { JobsModule } from '../jobs/jobs.module';
import { MarketsModule } from '../markets/markets.module';
import { McpModule } from '../mcp/mcp.module';
import { PresenceModule } from '../presence/presence.module';
import { RoomsModule } from '../rooms/rooms.module';
import { StatsModule } from '../stats/stats.module';
import { SteamModule } from '../steam/steam.module';
import { WeatherModule } from '../weather/weather.module';
import { HealthController } from './health.controller';

/**
 * Imports the feature modules for their exported services — the same singletons the
 * routes use, so the report describes the caches that are actually serving traffic.
 */
@Module({
  imports: [
    AskModule,
    ContactModule,
    GithubModule,
    GuestbookModule,
    JobsModule,
    MarketsModule,
    McpModule,
    PresenceModule,
    RoomsModule,
    StatsModule,
    SteamModule,
    WeatherModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}
