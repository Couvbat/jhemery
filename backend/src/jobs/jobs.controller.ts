import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { AdminGuard } from '../common/admin.guard';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { StartJobDto } from './jobs.dto';
import { ID_PATTERN, JobsService } from './jobs.service';
import type { DownloadJob, JobsInfo } from './jobs.types';

/**
 * Admin end to end: every route sits behind `AdminGuard`. The frontend also uses
 * `GET /jobs` as its "is this the password" check when the owner unlocks the
 * tools page — a 200 is yes, a 403 is no.
 */
@Controller('jobs')
@UseGuards(RateLimitGuard, AdminGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(): JobsInfo {
    return { configured: this.jobs.configured, jobs: this.jobs.list() };
  }

  /** 202: the job is accepted, not done. Twenty an hour is a generous evening. */
  @Post()
  @HttpCode(202)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000 })
  start(@Body() dto: StartJobDto): DownloadJob {
    if (!this.jobs.configured) {
      throw new ForbiddenException('The downloader is off on this deployment');
    }
    return this.jobs.start(dto.url);
  }

  @Get(':id')
  get(@Param('id') id: string): DownloadJob {
    const job = this.jobs.get(checkId(id));
    if (!job) throw new NotFoundException('No such job');
    return job;
  }

  /**
   * Fetch-once. The file is deleted when the response has been fully written;
   * a client that goes away mid-stream leaves it for the TTL sweep instead, so
   * a flaky connection does not cost the download.
   */
  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const file = this.jobs.takeFile(checkId(id));
    if (!file) throw new NotFoundException('No such file');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(file.size));
    // `--restrict-filenames` makes the name ASCII, so the plain form is enough.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    );
    try {
      await pipeline(createReadStream(file.path), res);
    } catch {
      return;
    }
    await this.jobs.release(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async cancel(@Param('id') id: string): Promise<void> {
    if (!(await this.jobs.cancel(checkId(id)))) {
      throw new NotFoundException('No such job');
    }
  }
}

/** Ids build a directory path, so anything that is not id-shaped is a 404 before it does. */
function checkId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new NotFoundException('No such job');
  return id;
}
