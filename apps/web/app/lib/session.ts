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

export async function serverApi<T>(path: string, init: RequestInit = {}) {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value;
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
