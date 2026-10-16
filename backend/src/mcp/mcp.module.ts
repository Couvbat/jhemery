import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { McpContentService } from './mcp.content';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [ConfigModule],
  controllers: [McpController],
  providers: [McpService, McpContentService],
  // The content service too: `ask` reads the same copy of content.json.
  exports: [McpService, McpContentService],
})
export class McpModule {}
