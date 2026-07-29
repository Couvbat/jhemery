import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContributionDay,
  GithubActivity,
  GithubCommit,
  GithubContributions,
  GithubPinnedRepos,
} from './github.types';

const CACHE_TTL_MS = 5 * 60 * 1000;
// The contribution graph changes at most daily, so cache it far longer.
const CONTRIBUTIONS_TTL_MS = 60 * 60 * 1000;
// Pinned repos change even less often than contributions.
const PINNED_REPOS_TTL_MS = 60 * 60 * 1000;
const MAX_COMMITS = 6;
const MAX_PINNED_REPOS = 6;

const CONTRIBUTIONS_QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

const PINNED_REPOS_QUERY = `
  query($login: String!, $first: Int!) {
    user(login: $login) {
      pinnedItems(first: $first, types: REPOSITORY) {
        nodes {
          ... on Repository {
            name
            description
            url
            stargazerCount
            forkCount
            primaryLanguage {
              name
              color
            }
          }
        }
      }
    }
  }
`;

interface ContributionsResponse {
  data?: {
    user?: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: number;
          weeks: Array<{
            contributionDays: Array<{
              date: string;
              contributionCount: number;
            }>;
          }>;
        };
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

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

interface PinnedReposResponse {
  data?: {
    user?: {
      pinnedItems: {
        nodes: Array<{
          name: string;
          description: string | null;
          url: string;
          stargazerCount: number;
          forkCount: number;
          primaryLanguage: { name: string; color: string } | null;
        }>;
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private cache: { data: GithubActivity; expiresAt: number } | null = null;
  private contributionsCache: {
    data: GithubContributions;
    expiresAt: number;
  } | null = null;
  private pinnedReposCache: {
    data: GithubPinnedRepos;
    expiresAt: number;
  } | null = null;

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

  /**
   * The contribution graph is only exposed through GitHub's GraphQL API, which
   * requires a token — unlike the REST endpoints the rest of this service uses.
   * Without one the frontend simply hides the heatmap.
   */
  async getContributions(): Promise<GithubContributions> {
    const username = this.config.get<string>('GITHUB_USERNAME');
    const token = this.config.get<string>('GITHUB_TOKEN');
    if (!username || !token) {
      return { configured: false };
    }

    if (
      this.contributionsCache &&
      this.contributionsCache.expiresAt > Date.now()
    ) {
      return this.contributionsCache.data;
    }

    try {
      const data = await this.fetchContributions(username, token);
      this.contributionsCache = {
        data,
        expiresAt: Date.now() + CONTRIBUTIONS_TTL_MS,
      };
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch GitHub contributions: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { configured: false };
    }
  }

  /**
   * Pinned repos are also GraphQL-only, so this shares the contributions
   * card's requirement of a token — the frontend hides the extra project
   * cards when unconfigured, same as everywhere else.
   */
  async getPinnedRepos(): Promise<GithubPinnedRepos> {
    const username = this.config.get<string>('GITHUB_USERNAME');
    const token = this.config.get<string>('GITHUB_TOKEN');
    if (!username || !token) {
      return { configured: false };
    }

    if (this.pinnedReposCache && this.pinnedReposCache.expiresAt > Date.now()) {
      return this.pinnedReposCache.data;
    }

    try {
      const data = await this.fetchPinnedRepos(username, token);
      this.pinnedReposCache = {
        data,
        expiresAt: Date.now() + PINNED_REPOS_TTL_MS,
      };
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch GitHub pinned repos: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { configured: false };
    }
  }

  private async fetchContributions(
    username: string,
    token: string,
  ): Promise<GithubContributions> {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'jhemery-portfolio',
      },
      body: JSON.stringify({
        query: CONTRIBUTIONS_QUERY,
        variables: { login: username },
      }),
    });
    if (!res.ok) throw new Error(`GitHub GraphQL failed: ${res.status}`);

    const json = (await res.json()) as ContributionsResponse;
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join('; '));
    }

    const calendar =
      json.data?.user?.contributionsCollection.contributionCalendar;
    if (!calendar) throw new Error('GitHub GraphQL returned no calendar');

    const weeks: ContributionDay[][] = calendar.weeks.map((week) =>
      week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
        level: bucket(day.contributionCount),
      })),
    );

    return {
      configured: true,
      total: calendar.totalContributions,
      weeks,
    };
  }

  private async fetchPinnedRepos(
    username: string,
    token: string,
  ): Promise<GithubPinnedRepos> {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'jhemery-portfolio',
      },
      body: JSON.stringify({
        query: PINNED_REPOS_QUERY,
        variables: { login: username, first: MAX_PINNED_REPOS },
      }),
    });
    if (!res.ok) throw new Error(`GitHub GraphQL failed: ${res.status}`);

    const json = (await res.json()) as PinnedReposResponse;
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join('; '));
    }

    const nodes = json.data?.user?.pinnedItems.nodes ?? [];
    return {
      configured: true,
      repos: nodes.map((n) => ({
        name: n.name,
        description: n.description,
        url: n.url,
        language: n.primaryLanguage?.name ?? null,
        languageColor: n.primaryLanguage?.color ?? null,
        stars: n.stargazerCount,
        forks: n.forkCount,
      })),
    };
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

/**
 * GitHub's own graph uses quartiles of the year's max; fixed thresholds are close
 * enough visually and avoid a second pass over the data.
 */
function bucket(count: number): number {
  if (count === 0) return 0;
  if (count < 3) return 1;
  if (count < 6) return 2;
  if (count < 10) return 3;
  return 4;
}
