import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SteamActivity,
  SteamRecentGame,
  SteamProfile,
  SteamStatus,
} from './steam.types';

const PERSONA_STATES: SteamStatus[] = [
  'offline',
  'online',
  'busy',
  'away',
  'snooze',
  'looking-to-trade',
  'looking-to-play',
];

const CACHE_TTL_MS = 5 * 60 * 1000;

interface ResolveVanityUrlResponse {
  response: { success: number; steamid?: string };
}

interface PlayerSummariesResponse {
  response: {
    players: Array<{
      personaname: string;
      avatarfull: string;
      profileurl: string;
      personastate: number;
      gameextrainfo?: string;
    }>;
  };
}

interface RecentlyPlayedGamesResponse {
  response: {
    games?: Array<{
      appid: number;
      name: string;
      img_icon_url: string;
      playtime_2weeks?: number;
      playtime_forever?: number;
    }>;
  };
}

async function fetchJson<T>(url: URL): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam API request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

@Injectable()
export class SteamService {
  private readonly logger = new Logger(SteamService.name);
  private resolvedSteamId64: string | null = null;
  private cache: { data: SteamActivity; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {}

  async getActivity(): Promise<SteamActivity> {
    const apiKey = this.config.get<string>('STEAM_API_KEY');
    const steamId = this.config.get<string>('STEAM_ID');

    if (!apiKey || !steamId) {
      return { configured: false };
    }

    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.data;
    }

    try {
      const steamId64 = await this.resolveSteamId64(apiKey, steamId);
      const [profile, recentGames] = await Promise.all([
        this.fetchProfile(apiKey, steamId64),
        this.fetchRecentGames(apiKey, steamId64),
      ]);

      const data: SteamActivity = { configured: true, profile, recentGames };
      this.cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch Steam activity: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { configured: false };
    }
  }

  private async resolveSteamId64(
    apiKey: string,
    steamId: string,
  ): Promise<string> {
    if (/^\d{17}$/.test(steamId)) {
      return steamId;
    }
    if (this.resolvedSteamId64) {
      return this.resolvedSteamId64;
    }

    const url = new URL(
      'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('vanityurl', steamId);

    const json = await fetchJson<ResolveVanityUrlResponse>(url);
    if (json.response.success !== 1 || !json.response.steamid) {
      throw new Error('Could not resolve Steam vanity URL');
    }

    this.resolvedSteamId64 = json.response.steamid;
    return json.response.steamid;
  }

  private async fetchProfile(
    apiKey: string,
    steamId64: string,
  ): Promise<SteamProfile> {
    const url = new URL(
      'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamids', steamId64);

    const json = await fetchJson<PlayerSummariesResponse>(url);
    const player = json.response.players?.[0];
    if (!player) throw new Error('Steam profile not found (is it public?)');

    return {
      name: player.personaname,
      avatar: player.avatarfull,
      profileUrl: player.profileurl,
      status: player.gameextrainfo
        ? 'in-game'
        : (PERSONA_STATES[player.personastate] ?? 'offline'),
      inGame: player.gameextrainfo,
    };
  }

  private async fetchRecentGames(
    apiKey: string,
    steamId64: string,
  ): Promise<SteamRecentGame[]> {
    const url = new URL(
      'https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamid', steamId64);
    url.searchParams.set('count', '6');

    const json = await fetchJson<RecentlyPlayedGamesResponse>(url);
    const games = json.response.games ?? [];

    return games.map((g) => ({
      appId: g.appid,
      name: g.name,
      iconUrl: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`,
      playtime2Weeks: g.playtime_2weeks ?? 0,
      playtimeForever: g.playtime_forever ?? 0,
    }));
  }
}
