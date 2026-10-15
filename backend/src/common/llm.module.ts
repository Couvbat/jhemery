import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm';

/**
 * The one `LlmService`: `ask` and the guestbook's moderator must share a single slot, so
 * both modules import this rather than each providing its own.
 */
@Module({
  imports: [ConfigModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
