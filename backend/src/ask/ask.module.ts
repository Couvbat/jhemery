import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LabModule } from '../lab/lab.module';
import { McpModule } from '../mcp/mcp.module';
import { AskController } from './ask.controller';
import { AskCorpusService } from './ask.corpus';
import { AskService } from './ask.service';

@Module({
  imports: [ConfigModule, McpModule, LabModule],
  controllers: [AskController],
  providers: [AskService, AskCorpusService],
  exports: [AskService],
})
export class AskModule {}
