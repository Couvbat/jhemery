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

export interface SteamActivity {
  configured: boolean;
  profile?: SteamProfile;
  recentGames?: SteamRecentGame[];
}
