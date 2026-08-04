import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';

@Module({
  imports: [ConfigModule],
  controllers: [AskController],
  providers: [AskService],
})
export class AskModule {}
