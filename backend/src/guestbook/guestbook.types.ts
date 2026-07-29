export interface GuestbookEntry {
  id: string;
  name: string;
  message: string;
  date: string;
}

export interface GuestbookList {
  enabled: boolean;
  entries?: GuestbookEntry[];
}
