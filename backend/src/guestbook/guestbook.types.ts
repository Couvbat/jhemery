import type { HoldReason } from './moderation';

/**
 * Where an entry is in its life (`docs/superpowers/specs/2026-10-15-guestbook-moderation-design.md`):
 * waiting for the model, held for the owner, or up. An entry stored before moderation
 * existed has none and reads as `published`, so there is no migration step.
 */
export type EntryStatus = 'pending' | 'held' | 'published';

/** Who let it out: the model's verdict, the grace period, or the owner's approval. */
export type ModeratedBy = 'model' | 'grace' | 'owner';

/** A reply the model wrote under an entry it published, with the best page it drew from. */
export interface EntryReply {
  text: string;
  by: 'model';
  /** A route or a command line, from retrieval, never from the model's text. */
  see?: string;
}

/** An entry as stored. */
export interface StoredEntry {
  id: string;
  name: string;
  message: string;
  date: string;
  status?: EntryStatus;
  reason?: HoldReason;
  moderatedBy?: ModeratedBy;
  /** When it was signed, which `date` stays too: the grace period counts from here. */
  signedAt?: string;
  /** The signer's language, for a reply in it. */
  locale?: 'en' | 'fr';
  reply?: EntryReply;
}

/** An entry as the public list shows it: what the signer wrote, and any reply. */
export interface GuestbookEntry {
  id: string;
  name: string;
  message: string;
  date: string;
  reply?: EntryReply;
}

export interface GuestbookList {
  enabled: boolean;
  entries?: GuestbookEntry[];
}

/** What the owner's list shows of an entry that isn't up. */
export interface HeldEntry {
  id: string;
  name: string;
  message: string;
  status: 'pending' | 'held';
  reason?: HoldReason;
  ageMs: number;
}
