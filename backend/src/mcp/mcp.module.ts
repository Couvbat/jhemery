import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { McpContentService } from './mcp.content';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [ConfigModule],
  controllers: [McpController],
  providers: [McpService, McpContentService],
  exports: [McpService],
})
export class McpModule {}
