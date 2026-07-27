import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SteamController } from './steam.controller';
import { SteamService } from './steam.service';

@Module({
  imports: [ConfigModule],
  controllers: [SteamController],
  providers: [SteamService],
})
export class SteamModule {}
