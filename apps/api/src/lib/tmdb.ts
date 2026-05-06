import { env } from "../config/env.js";
import { badRequest } from "./api-error.js";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

type TmdbSearchResponse<T> = {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
};

export type TmdbMediaType = "movie" | "tv";

export type TmdbSearchItem = {
  id: number;
  mediaType: TmdbMediaType;
  title: string;
  synopsis: string;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  voteAverage: number;
};

type TmdbMovieSearchResult = {
  id: number;
  title: string;
  overview: string;
  release_date?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
};

type TmdbTvSearchResult = {
  id: number;
  name: string;
  overview: string;
  first_air_date?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
};

type TmdbMovieDiscoverResult = TmdbMovieSearchResult;
type TmdbTvDiscoverResult = TmdbTvSearchResult;

export type TmdbGenre = {
  id: number;
  name: string;
};

export type TmdbMovieDetails = {
  id: number;
  title: string;
  overview: string;
  release_date?: string;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: TmdbGenre[];
  vote_average: number | null;
};

export type TmdbTvDetails = {
  id: number;
  name: string;
  overview: string;
  first_air_date?: string;
  episode_run_time: number[];
  number_of_seasons: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: TmdbGenre[];
  vote_average: number | null;
};

export type TmdbSeasonDetails = {
  id: number;
  season_number: number;
  episodes: Array<{
    id: number;
    episode_number: number;
    runtime: number | null;
  }>;
};

function assertTmdbConfigured() {
  if (!env.TMDB_API_TOKEN) {
    throw badRequest("TMDB_NOT_CONFIGURED", "TMDB_API_TOKEN is required for catalog import");
  }
}

function imageUrl(path: string | null, size: "w500" | "w1280") {
  return path ? `${TMDB_IMAGE_BASE_URL}/${size}${path}` : null;
}

function releaseYear(value?: string) {
  if (!value) {
    return null;
  }

  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

async function tmdbFetch<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  assertTmdbConfigured();

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("language", env.TMDB_LANGUAGE);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${env.TMDB_API_TOKEN}`,
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw badRequest("TMDB_REQUEST_FAILED", `TMDB request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function searchTmdb(query: string, type: TmdbMediaType, page: number) {
  if (type === "movie") {
    const result = await tmdbFetch<TmdbSearchResponse<TmdbMovieSearchResult>>("/search/movie", {
      query,
      page,
      include_adult: "false"
    });

    return {
      page: result.page,
      total: result.total_results,
      totalPages: result.total_pages,
      results: result.results.map<TmdbSearchItem>((item) => ({
        id: item.id,
        mediaType: "movie",
        title: item.title,
        synopsis: item.overview,
        releaseYear: releaseYear(item.release_date),
        posterUrl: imageUrl(item.poster_path, "w500"),
        backdropUrl: imageUrl(item.backdrop_path, "w1280"),
        voteAverage: item.vote_average
      }))
    };
  }

  const result = await tmdbFetch<TmdbSearchResponse<TmdbTvSearchResult>>("/search/tv", {
    query,
    page,
    include_adult: "false"
  });

  return {
    page: result.page,
    total: result.total_results,
    totalPages: result.total_pages,
    results: result.results.map<TmdbSearchItem>((item) => ({
      id: item.id,
      mediaType: "tv",
      title: item.name,
      synopsis: item.overview,
      releaseYear: releaseYear(item.first_air_date),
      posterUrl: imageUrl(item.poster_path, "w500"),
      backdropUrl: imageUrl(item.backdrop_path, "w1280"),
      voteAverage: item.vote_average
    }))
  };
}

export async function discoverTmdb(type: TmdbMediaType, page: number) {
  if (type === "movie") {
    const result = await tmdbFetch<TmdbSearchResponse<TmdbMovieDiscoverResult>>("/discover/movie", {
      page,
      include_adult: "false",
      include_video: "false",
      sort_by: "popularity.desc"
    });

    return {
      page: result.page,
      total: result.total_results,
      totalPages: result.total_pages,
      results: result.results.map<TmdbSearchItem>((item) => ({
        id: item.id,
        mediaType: "movie",
        title: item.title,
        synopsis: item.overview,
        releaseYear: releaseYear(item.release_date),
        posterUrl: imageUrl(item.poster_path, "w500"),
        backdropUrl: imageUrl(item.backdrop_path, "w1280"),
        voteAverage: item.vote_average
      }))
    };
  }

  const result = await tmdbFetch<TmdbSearchResponse<TmdbTvDiscoverResult>>("/discover/tv", {
    page,
    include_adult: "false",
    sort_by: "popularity.desc"
  });

  return {
    page: result.page,
    total: result.total_results,
    totalPages: result.total_pages,
    results: result.results.map<TmdbSearchItem>((item) => ({
      id: item.id,
      mediaType: "tv",
      title: item.name,
      synopsis: item.overview,
      releaseYear: releaseYear(item.first_air_date),
      posterUrl: imageUrl(item.poster_path, "w500"),
      backdropUrl: imageUrl(item.backdrop_path, "w1280"),
      voteAverage: item.vote_average
    }))
  };
}

export function getTmdbMovieDetails(id: number) {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${id}`);
}

export function getTmdbTvDetails(id: number) {
  return tmdbFetch<TmdbTvDetails>(`/tv/${id}`);
}

export function getTmdbSeasonDetails(id: number, seasonNumber: number) {
  return tmdbFetch<TmdbSeasonDetails>(`/tv/${id}/season/${seasonNumber}`);
}

export function tmdbPosterUrl(path: string | null) {
  return imageUrl(path, "w500");
}

export function tmdbBackdropUrl(path: string | null) {
  return imageUrl(path, "w1280");
}

export function tmdbReleaseYear(value?: string) {
  return releaseYear(value);
}
