import { Controller, Get } from '@nestjs/common';
import { GithubService } from './github.service';
import { GithubActivity, GithubContributions } from './github.types';

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
}
