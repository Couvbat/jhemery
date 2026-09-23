export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

/**
 * One download, as the owner's page sees it. There is no file path here on
 * purpose: the file is reached through `GET /jobs/:id/file` and nothing else,
 * and it is gone once fetched or after its TTL.
 */
export interface DownloadJob {
  id: string;
  /** The URL as accepted — canonical, tracking stripped. */
  url: string;
  status: JobStatus;
  /** 0–1 from yt-dlp's own progress lines while running; null before the first. */
  progress: number | null;
  /** The produced file's name, once done. */
  filename: string | null;
  /** Bytes, once done. */
  size: number | null;
  /** yt-dlp's last line when it failed — never its whole log. */
  error: string | null;
  createdAt: number;
  /** When the file was produced. Deleted `FILE_TTL_MS` later if never fetched. */
  finishedAt: number | null;
}

export interface JobsInfo {
  /** `DOWNLOADER_ENABLED` and the yt-dlp binary both present. */
  configured: boolean;
  jobs: DownloadJob[];
}
