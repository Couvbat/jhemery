import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Injectable,
  Post,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { serverTiming } from '../common/server-timing';
import { LabSnapshotDto } from './lab.dto';
import { LabService } from './lab.service';
import type { IngestResult, LabReport, LabSnapshot } from './lab.types';

/**
 * The lab's bearer token, as a guard so it runs before the body is validated: a caller
 * without the token learns nothing from a 400. Missing, wrong, or a server whose own
 * token is unset or short: a bare 403 either way.
 */
@Injectable()
export class LabIngestGuard implements CanActivate {
  constructor(private readonly lab: LabService) {}

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>()
      .headers.authorization;
    if (!this.lab.authorised(header)) throw new ForbiddenException();
    return true;
  }
}

@Controller('lab')
@UseGuards(RateLimitGuard)
export class LabController {
  constructor(private readonly lab: LabService) {}

  /**
   * What visitors read. Never calls the lab: it serves the copy the last push left, and
   * says how old it is in `Server-Timing`, as the caching routes do.
   */
  @Get()
  @RateLimit({ limit: 60, windowMs: 60_000 })
  @Header('Cache-Control', 'public, max-age=15')
  async report(@Res({ passthrough: true }) res: Response): Promise<LabReport> {
    const report = await this.lab.report();
    serverTiming(
      res,
      report.configured && report.ageMs !== null
        ? { cache: 'hit', ageMs: report.ageMs }
        : null,
    );
    return report;
  }

  /**
   * The lab's push, once a minute. Unknown properties are a 400 that names them, where
   * the global pipe would only strip them: an agent that has started sending something
   * it shouldn't must hear about it, and so must its log.
   *
   * The parameter is typed with the interface, not the DTO, on purpose. The global pipe
   * runs first and strips whatever the DTO doesn't list, so a route pipe behind it
   * would never see an unknown property to refuse. An interface is `Object` at runtime,
   * which the global pipe passes through untouched, and this pipe validates against the
   * DTO by `expectedType` instead.
   */
  @Post('snapshot')
  @HttpCode(200)
  @RateLimit({ limit: 6, windowMs: 60_000 })
  @UseGuards(LabIngestGuard)
  ingest(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: LabSnapshotDto,
      }),
    )
    snapshot: LabSnapshot,
  ): Promise<IngestResult> {
    return this.lab.ingest(snapshot);
  }
}
