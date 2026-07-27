import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GithubActivity, GithubCommit } from './github.types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_COMMITS = 6;

interface CommitSearchResponse {
  items: Array<{
    sha: string;
    html_url: string;
    commit: {
      message: string;
      author: { date: string };
      committer: { date: string };
    };
    repository: { full_name: string; private: boolean };
  }>;
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private cache: { data: GithubActivity; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {}

  async getActivity(): Promise<GithubActivity> {
    const username = this.config.get<string>('GITHUB_USERNAME');
    if (!username) {
      return { configured: false };
    }

    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.data;
    }

    try {
      const commits = await this.fetchRecentCommits(username);
      const data: GithubActivity = { configured: true, commits };
      this.cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch GitHub activity: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { configured: false };
    }
  }

  private async fetchRecentCommits(username: string): Promise<GithubCommit[]> {
    const token = this.config.get<string>('GITHUB_TOKEN');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'jhemery-portfolio',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = new URL('https://api.github.com/search/commits');
    url.searchParams.set('q', `author:${username}`);
    url.searchParams.set('sort', 'committer-date');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(MAX_COMMITS * 2));

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub commit search failed: ${res.status}`);
    const json = (await res.json()) as CommitSearchResponse;

    return json.items
      .filter((item) => !item.repository.private)
      .slice(0, MAX_COMMITS)
      .map((item) => ({
        repo: item.repository.full_name,
        sha: item.sha.slice(0, 7),
        message: item.commit.message.split('\n')[0].slice(0, 72),
        url: item.html_url,
        date: item.commit.committer.date,
      }));
  }
}
