export type SteamStatus =
  | 'offline'
  | 'online'
  | 'busy'
  | 'away'
  | 'snooze'
  | 'looking-to-trade'
  | 'looking-to-play'
  | 'in-game';

export interface SteamRecentGame {
  appId: number;
  name: string;
  iconUrl: string;
  playtime2Weeks: number;
  playtimeForever: number;
}

export interface SteamProfile {
  name: string;
  avatar: string;
  profileUrl: string;
  status: SteamStatus;
  inGame?: string;
}

/** A favourite's receipts: its hours from the library, and its achievements if it has any. */
export interface SteamFavourite {
  appId: number;
  /** Minutes played, all time. */
  minutes: number;
  achievements?: { achieved: number; total: number };
}

export interface SteamActivity {
  configured: boolean;
  profile?: SteamProfile;
  recentGames?: SteamRecentGame[];
  /**
   * The games `?apps=` asked about that the library holds, in the order asked. Absent when
   * none were asked about, or the library couldn't be read.
   */
  favourites?: SteamFavourite[];
}
