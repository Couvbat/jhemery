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

export interface GithubPinnedRepo {
  name: string;
  description: string | null;
  url: string;
  language: string | null;
  languageColor: string | null;
  stars: number;
  forks: number;
}

export interface GithubPinnedRepos {
  configured: boolean;
  repos?: GithubPinnedRepo[];
}

export interface WorkflowRun {
  /** The workflow's display name, e.g. `deploy`. */
  name: string;
  /** `queued` | `in_progress` | `completed`. */
  status: string;
  /** `success` | `failure` | `cancelled` | … — null while still running. */
  conclusion: string | null;
  branch: string;
  sha: string;
  url: string;
  startedAt: string;
  /** Wall-clock length of a finished run; null while it is still going. */
  durationMs: number | null;
}

export interface GithubWorkflowStatus {
  configured: boolean;
  repo?: string;
  runs?: WorkflowRun[];
}
