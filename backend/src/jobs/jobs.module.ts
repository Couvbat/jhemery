import { Module } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { JobsController } from './jobs.controller';
import { JobsService, SPAWN } from './jobs.service';

@Module({
  controllers: [JobsController],
  // The real spawn, as a provider: the service never imports it, so its tests can
  // hand it a child that does what they say.
  providers: [JobsService, { provide: SPAWN, useValue: spawn }],
  exports: [JobsService],
})
export class JobsModule {}
