import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LabController, LabIngestGuard } from './lab.controller';
import { LabService } from './lab.service';

@Module({
  imports: [ConfigModule],
  controllers: [LabController],
  providers: [LabService, LabIngestGuard],
  exports: [LabService],
})
export class LabModule {}
