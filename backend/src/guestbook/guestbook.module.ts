import { Module } from '@nestjs/common';
import { AskModule } from '../ask/ask.module';
import { LlmModule } from '../common/llm.module';
import { GuestbookController } from './guestbook.controller';
import { GuestbookService } from './guestbook.service';

@Module({
  // The model's one slot, shared with `ask`, and `ask`'s passages for grounded replies.
  imports: [LlmModule, AskModule],
  controllers: [GuestbookController],
  providers: [GuestbookService],
  exports: [GuestbookService],
})
export class GuestbookModule {}
