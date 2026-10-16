import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { timedCopy } from '../common/server-timing';
import { GithubService } from './github.service';
import {
  GithubActivity,
  GithubContributions,
  GithubPinnedRepos,
  GithubWorkflowStatus,
} from './github.types';

/** Each route says whether it served its cache or fetched, in `Server-Timing` (see `timedCopy`). */
@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Get('activity')
  getActivity(
    @Res({ passthrough: true }) res: Response,
  ): Promise<GithubActivity> {
    return timedCopy(
      res,
      () => this.githubService.cacheAges().activity,
      () => this.githubService.getActivity(),
    );
  }

  @Get('contributions')
  getContributions(
    @Res({ passthrough: true }) res: Response,
  ): Promise<GithubContributions> {
    return timedCopy(
      res,
      () => this.githubService.cacheAges().contributions,
      () => this.githubService.getContributions(),
    );
  }

  @Get('pinned-repos')
  getPinnedRepos(
    @Res({ passthrough: true }) res: Response,
  ): Promise<GithubPinnedRepos> {
    return timedCopy(
      res,
      () => this.githubService.cacheAges().pinnedRepos,
      () => this.githubService.getPinnedRepos(),
    );
  }

  @Get('workflow-status')
  getWorkflowStatus(
    @Res({ passthrough: true }) res: Response,
  ): Promise<GithubWorkflowStatus> {
    return timedCopy(
      res,
      () => this.githubService.cacheAges().workflowStatus,
      () => this.githubService.getWorkflowStatus(),
    );
  }
}
