import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "../components/LogoutButton";
import { SearchForm } from "../components/SearchForm";
import { TitleCard } from "../components/TitleCard";
import {
  PROFILE_COOKIE,
  type Genre,
  type Title,
  type WatchlistItem,
  requireUser,
  serverApi
} from "../lib/session";

type SearchPageProps = {
  searchParams: {
    q?: string;
    type?: string;
    genre?: string;
    page?: string;
  };
};

function cleanParam(value: string | undefined) {
  return value?.trim() || undefined;
}

function buildCatalogPath(params: SearchPageProps["searchParams"]) {
  const query = cleanParam(params.q);
  const type = cleanParam(params.type);
  const genre = cleanParam(params.genre);
  const page = cleanParam(params.page) ?? "1";
  const search = new URLSearchParams({
    page,
    pageSize: "30"
  });

  if (query) {
    search.set("q", query);
  }

  if (type) {
    search.set("type", type);
  }

  if (genre) {
    search.set("genre", genre);
  }

  return query ? `/titles/search?${search.toString()}` : `/titles?${search.toString()}`;
}

function filterClientSide(titles: Title[], params: SearchPageProps["searchParams"]) {
  const type = cleanParam(params.type);
  const genre = cleanParam(params.genre);

  return titles.filter((title) => {
    if (type && title.type !== type) {
      return false;
    }

    if (genre && !title.genres.some((item) => item.slug === genre)) {
      return false;
    }

    return true;
  });
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  await requireUser();
  const profileId = cookies().get(PROFILE_COOKIE)?.value;

  if (!profileId) {
    redirect("/profiles");
  }

  const [genres, titles, watchlist] = await Promise.all([
    serverApi<Genre[]>("/genres"),
    serverApi<Title[]>(buildCatalogPath(searchParams)),
    serverApi<WatchlistItem[]>(`/watchlist?profileId=${profileId}&pageSize=50`)
  ]);
  const results = filterClientSide(titles.body.data ?? [], searchParams);
  const watchlistIds = new Set((watchlist.body.data ?? []).map((item) => item.titleId));
  const query = cleanParam(searchParams.q);

  return (
    <main className="search-page">
      <nav className="top-nav search-nav">
        <a className="brand-mark" href="/">
          Movth
        </a>
        <div className="nav-actions">
          <a href="/account">Conta</a>
          <a href="/profiles">Perfis</a>
          <LogoutButton />
        </div>
      </nav>

      <section className="search-header">
        <p className="eyebrow">Busca</p>
        <h1>{query ? `Resultados para "${query}"` : "Explorar catalogo"}</h1>
        <SearchForm genres={genres.body.data ?? []} />
      </section>

      <section className="search-results">
        <div className="section-header">
          <h2>{results.length} resultado{results.length === 1 ? "" : "s"}</h2>
        </div>
        {results.length > 0 ? (
          <div className="results-grid">
            {results.map((title) => (
              <TitleCard
                inWatchlist={watchlistIds.has(title.id)}
                key={title.id}
                profileId={profileId}
                title={title}
              />
            ))}
          </div>
        ) : (
          <p className="empty-state">Nenhum titulo encontrado com esses filtros.</p>
        )}
      </section>
    </main>
  );
}
