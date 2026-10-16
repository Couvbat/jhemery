import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SteamActivity,
  SteamFavourite,
  SteamRecentGame,
  SteamProfile,
  SteamStatus,
} from './steam.types';
import { cacheAge, UnitHealth } from '../common/health';

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
/** Hours played and achievements move slowly: the library and each game's count, a day. */
const LIBRARY_TTL_MS = 24 * 60 * 60 * 1000;
/** As many favourites as one request may ask about. */
export const MAX_FAVOURITES = 8;

/**
 * `?apps=250900,427520`: the favourites' app ids, as `content/gaming.ts` lists them. Up to
 * eight, each once; anything else is read as no favourites, never as an error, since the
 * activity beside them is still worth answering.
 */
export function parseApps(raw: unknown): number[] {
  const pattern = new RegExp(
    `^\\d{1,10}(?:,\\d{1,10}){0,${MAX_FAVOURITES - 1}}$`,
  );
  if (typeof raw !== 'string' || !pattern.test(raw)) return [];
  return [...new Set(raw.split(',').map(Number))];
}

type Achievements = NonNullable<SteamFavourite['achievements']>;

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

interface OwnedGamesResponse {
  response: {
    games?: Array<{ appid: number; playtime_forever?: number }>;
  };
}

interface PlayerAchievementsResponse {
  playerstats?: { achievements?: Array<{ achieved: number }>; error?: string };
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
  private library: { data: Map<number, number>; expiresAt: number } | null =
    null;
  private readonly achievementCounts = new Map<
    number,
    { data: Achievements | null; expiresAt: number }
  >();

  constructor(private config: ConfigService) {}

  /** The live activity, and the receipts of each favourite `apps` names. */
  async getActivity(apps: readonly number[] = []): Promise<SteamActivity> {
    const apiKey = this.config.get<string>('STEAM_API_KEY');
    const steamId = this.config.get<string>('STEAM_ID');

    if (!apiKey || !steamId) {
      return { configured: false };
    }

    const activity = await this.activity(apiKey, steamId);
    if (!activity.configured || !apps.length) return activity;
    const favourites = await this.favourites(apiKey, steamId, apps);
    return favourites ? { ...activity, favourites } : activity;
  }

  private async activity(
    apiKey: string,
    steamId: string,
  ): Promise<SteamActivity> {
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

  /**
   * Each favourite the library holds, with its hours and, when the game keeps any, its
   * achievements. The library is one call a day whatever is asked, and only a game in it
   * is ever looked up, so a forged `?apps=` costs at most one call per game owned, a day.
   * Undefined when the library can't be read, Steam being down: the cards then show the
   * notes alone. Game details that aren't public read as an empty library, the same.
   */
  private async favourites(
    apiKey: string,
    steamId: string,
    apps: readonly number[],
  ): Promise<SteamFavourite[] | undefined> {
    try {
      const steamId64 = await this.resolveSteamId64(apiKey, steamId);
      const library = await this.fetchLibrary(apiKey, steamId64);
      const owned = apps.filter((appId) => library.has(appId));
      const counts = await Promise.all(
        owned.map((appId) => this.fetchAchievements(apiKey, steamId64, appId)),
      );
      return owned.map((appId, i) => ({
        appId,
        minutes: library.get(appId)!,
        ...(counts[i] ? { achievements: counts[i] } : {}),
      }));
    } catch (err) {
      this.logger.warn(
        `Failed to fetch the Steam library: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  /** Every owned game's minutes played, by app id. An empty answer is kept only briefly. */
  private async fetchLibrary(
    apiKey: string,
    steamId64: string,
  ): Promise<Map<number, number>> {
    if (this.library && this.library.expiresAt > Date.now()) {
      return this.library.data;
    }
    const url = new URL(
      'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamid', steamId64);
    url.searchParams.set('include_played_free_games', '1');

    const json = await fetchJson<OwnedGamesResponse>(url);
    const data = new Map(
      (json.response.games ?? []).map((g) => [
        g.appid,
        g.playtime_forever ?? 0,
      ]),
    );
    this.library = {
      data,
      expiresAt: Date.now() + (data.size ? LIBRARY_TTL_MS : CACHE_TTL_MS),
    };
    return data;
  }

  /**
   * How many of a game's achievements are unlocked, or null when Steam won't say. Two
   * refusals are answers, kept a day like a count: a 400 "Requested app has no stats" for a
   * game that keeps none, and a 403 "Profile is not public", since the library's hours ask
   * only for public game details and achievements ask for the profile. That one is logged,
   * being the owner's setting to change. Any other failure is kept for five minutes, so a
   * blip doesn't hide a count for a day, and none fails the activity beside it.
   */
  private async fetchAchievements(
    apiKey: string,
    steamId64: string,
    appId: number,
  ): Promise<Achievements | null> {
    const cached = this.achievementCounts.get(appId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    let data: Achievements | null = null;
    let ttl = CACHE_TTL_MS;
    try {
      const url = new URL(
        'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/',
      );
      url.searchParams.set('key', apiKey);
      url.searchParams.set('steamid', steamId64);
      url.searchParams.set('appid', String(appId));
      const res = await fetch(url);
      if (res.ok) {
        const list =
          ((await res.json()) as PlayerAchievementsResponse).playerstats
            ?.achievements ?? [];
        if (list.length) {
          data = {
            achieved: list.filter((a) => a.achieved === 1).length,
            total: list.length,
          };
        }
        ttl = LIBRARY_TTL_MS;
      } else if (res.status === 400 || res.status === 403) {
        ttl = LIBRARY_TTL_MS;
        const error = (
          (await res.json().catch(() => ({}))) as PlayerAchievementsResponse
        ).playerstats?.error;
        if (error && !/no stats/i.test(error)) {
          this.logger.warn(`Steam achievements for ${appId}: ${error}`);
        }
      }
    } catch {
      // Unreachable: no count, and another try in five minutes.
    }
    this.achievementCounts.set(appId, { data, expiresAt: Date.now() + ttl });
    return data;
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

  /** Configured or not, and how old the cached profile is — nothing is fetched. */
  health(): UnitHealth {
    const configured = Boolean(
      this.config.get<string>('STEAM_API_KEY') &&
      this.config.get<string>('STEAM_ID'),
    );
    return configured
      ? {
          unit: 'steam',
          state: 'active',
          cacheAge: cacheAge(this.cache, CACHE_TTL_MS),
        }
      : { unit: 'steam', state: 'inactive', reason: 'unconfigured' };
  }
}
