import { Controller, Get } from '@nestjs/common';
import { MarketsService } from './markets.service';
import { MarketsReport } from './markets.types';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  async getQuotes(): Promise<MarketsReport> {
    return this.marketsService.getQuotes();
  }
}
