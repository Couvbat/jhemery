import { Controller, Get } from '@nestjs/common';
import { SteamService } from './steam.service';
import { SteamActivity } from './steam.types';

@Controller('steam')
export class SteamController {
  constructor(private readonly steamService: SteamService) {}

  @Get('activity')
  async getActivity(): Promise<SteamActivity> {
    return this.steamService.getActivity();
  }
}
