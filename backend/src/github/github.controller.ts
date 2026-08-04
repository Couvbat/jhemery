import { Controller, Get } from '@nestjs/common';
import { GithubService } from './github.service';
import {
  GithubActivity,
  GithubContributions,
  GithubPinnedRepos,
  GithubWorkflowStatus,
} from './github.types';

@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Get('activity')
  async getActivity(): Promise<GithubActivity> {
    return this.githubService.getActivity();
  }

  @Get('contributions')
  async getContributions(): Promise<GithubContributions> {
    return this.githubService.getContributions();
  }

  @Get('pinned-repos')
  async getPinnedRepos(): Promise<GithubPinnedRepos> {
    return this.githubService.getPinnedRepos();
  }

  @Get('workflow-status')
  async getWorkflowStatus(): Promise<GithubWorkflowStatus> {
    return this.githubService.getWorkflowStatus();
  }
}
