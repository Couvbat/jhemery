import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [ConfigModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}

