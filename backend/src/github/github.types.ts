export interface GithubCommit {
  repo: string;
  sha: string;
  message: string;
  url: string;
  date: string;
}

export interface GithubActivity {
  configured: boolean;
  commits?: GithubCommit[];
}

export interface ContributionDay {
  date: string;
  count: number;
  /** 0–4, matching GitHub's own graph buckets. */
  level: number;
}

export interface GithubContributions {
  configured: boolean;
  total?: number;
  /** Weeks of 7 days, oldest first. */
  weeks?: ContributionDay[][];
}
