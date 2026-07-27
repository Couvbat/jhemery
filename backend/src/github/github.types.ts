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
