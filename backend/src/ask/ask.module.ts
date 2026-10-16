import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../common/llm.module';
import { LabModule } from '../lab/lab.module';
import { McpModule } from '../mcp/mcp.module';
import { AskController } from './ask.controller';
import { AskCorpusService } from './ask.corpus';
import { AskService } from './ask.service';

@Module({
  imports: [ConfigModule, McpModule, LabModule, LlmModule],
  controllers: [AskController],
  providers: [AskService, AskCorpusService],
  // The corpus too: the guestbook's replies are grounded in the same passages.
  exports: [AskService, AskCorpusService],
})
export class AskModule {}
