import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [ConfigModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
