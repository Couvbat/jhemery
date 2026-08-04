import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';

@Module({
  imports: [ConfigModule],
  controllers: [MarketsController],
  providers: [MarketsService],
})
export class MarketsModule {}
