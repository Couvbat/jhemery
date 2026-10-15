import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { McpModule } from '../mcp/mcp.module';
import { AskController } from './ask.controller';
import { AskCorpusService } from './ask.corpus';
import { AskService } from './ask.service';

@Module({
  imports: [ConfigModule, McpModule],
  controllers: [AskController],
  providers: [AskService, AskCorpusService],
  exports: [AskService],
})
export class AskModule {}
