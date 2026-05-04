import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ACCESS_TOKEN_COOKIE = "movth_access_token";
export const REFRESH_TOKEN_COOKIE = "movth_refresh_token";
export const PROFILE_COOKIE = "movth_profile_id";

export type ApiEnvelope<T> = {
  data?: T;
  meta?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    issues?: unknown;
  };
};

export type AuthUser = {
  id: string;
  email: string;
  role?: string;
  trialEndsAt: string | null;
  plan: {
    id: string;
    name: string;
    maxProfiles: number;
    maxStreams: number;
    has4k: boolean;
  } | null;
};

export type Profile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isKids: boolean;
  hasPin: boolean;
};

export type Genre = {
  id: string;
  name: string;
  slug: string;
};

export type TitleAsset = {
  id: string;
  quality: string;
  status: string;
  thumbnailUrl: string | null;
};

export type Title = {
  id: string;
  type: "MOVIE" | "SERIES";
  status?: string;
  title: string;
  synopsis: string;
  releaseYear: number;
  rating: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  tmdbId?: number | null;
  genres: Genre[];
  assets?: TitleAsset[];
};

export type WatchHistoryItem = {
  id: string;
  profileId: string;
  titleId: string;
  episodeId: string | null;
  positionS: number;
  completed: boolean;
  updatedAt: string;
  title: Title;
  episode: {
    id: string;
    season: number;
    number: number;
    durationS: number;
  } | null;
};

export type WatchlistItem = {
  profileId: string;
  titleId: string;
  createdAt: string;
  title: Title;
};

export type Episode = {
  id: string;
  titleId: string;
  season: number;
  number: number;
  durationS: number;
  videoAssets: TitleAsset[];
};

export type EpisodeSeason = {
  season: number;
  episodes: Episode[];
};

export type EpisodesResponse = {
  seasons: EpisodeSeason[];
};

export type WatchResponse = {
  assetId: string;
  titleId: string;
  episodeId: string | null;
  quality: string;
  manifestUrl: string;
  expiresAt: string;
  sessionId: string;
  title: {
    id: string;
    type: "MOVIE" | "SERIES";
    title: string;
    releaseYear: number;
    rating: string;
  };
  episode: {
    id: string;
    season: number;
    number: number;
    durationS: number;
  } | null;
};

type TokenPairResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

export function apiBaseUrl() {
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

export function setAuthCookies(tokens: { accessToken: string; refreshToken: string }) {
  cookies().set(ACCESS_TOKEN_COOKIE, tokens.accessToken, cookieOptions(15 * 60));
  cookies().set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions(30 * 24 * 60 * 60));
}

export function clearAuthCookies() {
  cookies().delete(ACCESS_TOKEN_COOKIE);
  cookies().delete(REFRESH_TOKEN_COOKIE);
  cookies().delete(PROFILE_COOKIE);
}

function trySetAuthCookies(tokens: { accessToken: string; refreshToken: string }) {
  try {
    setAuthCookies(tokens);
  } catch {
    // Server Components can use the refreshed token for this render, while Route Handlers persist it.
  }
}

function tryClearAuthCookies() {
  try {
    clearAuthCookies();
  } catch {
    // Cookie mutation is only available in Route Handlers and Server Actions.
  }
}

async function refreshAccessToken() {
  const refreshToken = cookies().get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store"
  });
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<TokenPairResponse>;

  if (!response.ok || !body.data) {
    tryClearAuthCookies();
    return null;
  }

  trySetAuthCookies(body.data);
  return body.data.accessToken;
}

async function apiFetch<T>(path: string, init: RequestInit, accessToken?: string) {
  const headers = new Headers(init.headers);

  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

export async function serverApi<T>(path: string, init: RequestInit = {}) {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value;
  const result = await apiFetch<T>(path, init, accessToken);

  if (result.status !== 401) {
    return result;
  }

  const refreshedAccessToken = await refreshAccessToken();

  if (!refreshedAccessToken) {
    return result;
  }

  return apiFetch<T>(path, init, refreshedAccessToken);
}

export async function requireUser() {
  const result = await serverApi<AuthUser>("/auth/me");

  if (!result.ok || !result.body.data) {
    redirect("/login");
  }

  return result.body.data;
}

export async function redirectIfAuthenticated() {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return;
  }

  const result = await serverApi<AuthUser>("/auth/me");

  if (result.ok && result.body.data) {
    redirect("/profiles");
  }
}
