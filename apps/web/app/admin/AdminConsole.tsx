"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { Genre, TitleAsset } from "../lib/session";

type AdminTitleGenre = {
  genre: Genre;
};

type AdminEpisode = {
  id: string;
  titleId: string;
  season: number;
  number: number;
  durationS: number;
  videoAssets?: AdminVideoAsset[];
};

type AdminVideoAsset = TitleAsset & {
  titleId?: string;
  episodeId?: string | null;
  hlsManifestUrl?: string;
};

export type AdminTitle = {
  id: string;
  type: "MOVIE" | "SERIES";
  status: "DRAFT" | "PROCESSING" | "READY" | "ARCHIVED";
  title: string;
  synopsis: string;
  releaseYear: number;
  rating: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  tmdbId: number | null;
  genres: AdminTitleGenre[];
  episodes: AdminEpisode[];
  videoAssets: AdminVideoAsset[];
};

type UploadResponse = {
  uploadUrl: string;
  method: "PUT";
  bucket: string;
  s3Key: string;
  expiresIn: number;
};

type QueueResponse = {
  jobId: string | number | null;
  status: string;
};

type TmdbSearchItem = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  synopsis: string;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  voteAverage: number;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message: string;
  };
};

type AdminConsoleProps = {
  genres: Genre[];
  initialTitles: AdminTitle[];
};

function emptyToNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function statusLabel(status: AdminTitle["status"]) {
  const labels = {
    DRAFT: "Rascunho",
    PROCESSING: "Processando",
    READY: "Pronto",
    ARCHIVED: "Arquivado"
  };

  return labels[status];
}

function playbackLabel(title: AdminTitle) {
  const readyAssets = allVideoAssets(title).filter((asset) => asset.status === "READY");

  if (title.status === "ARCHIVED") {
    return "Arquivado";
  }

  if (readyAssets.some((asset) => asset.source === "HLS") && title.status === "READY") {
    return "Movth";
  }

  if (readyAssets.some((asset) => asset.source === "EMBED") && title.status === "READY") {
    return "Fonte externa";
  }

  if (title.status === "PROCESSING") {
    return "Transcodificando";
  }

  return "Requer asset";
}

function allVideoAssets(title: AdminTitle) {
  return [
    ...title.videoAssets,
    ...title.episodes.flatMap((episode) => episode.videoAssets ?? [])
  ];
}

function playbackSummary(title: AdminTitle) {
  const assets = allVideoAssets(title);
  const ready = assets.filter((asset) => asset.status === "READY");

  return {
    total: assets.length,
    ready: ready.length,
    hls: ready.filter((asset) => asset.source === "HLS").length,
    embed: ready.filter((asset) => asset.source === "EMBED").length,
    missing: ready.length === 0
  };
}

function coverageSummary(titles: AdminTitle[]) {
  return {
    hls: titles.filter((title) => playbackSummary(title).hls > 0).length,
    embed: titles.filter((title) => playbackSummary(title).embed > 0).length,
    missing: titles.filter((title) => playbackSummary(title).missing).length
  };
}

function sourceLabel(source: AdminVideoAsset["source"]) {
  if (!source) {
    return "Origem indefinida";
  }

  return source === "HLS" ? "Movth" : "Fonte externa";
}

function buildAdminTitlesPath(filters: { q: string; type: string; status: string; playback: string }) {
  const params = new URLSearchParams({
    pageSize: "100"
  });

  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }

  if (filters.type) {
    params.set("type", filters.type);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.playback) {
    params.set("playback", filters.playback);
  }

  return `/api/admin/titles?${params.toString()}`;
}

async function parseResponse<T>(response: Response) {
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "Falha na operacao");
  }

  return body.data;
}

async function parseEmptyResponse(response: Response) {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<unknown>;
    throw new Error(body.error?.message ?? "Falha na operacao");
  }
}

function titlePayloadFromForm(formData: FormData, genres: Genre[]) {
  const genreSlugs = genres
    .filter((genre) => formData.get(`genre:${genre.slug}`) === "on")
    .map((genre) => genre.slug);
  const tmdbIdValue = String(formData.get("tmdbId") ?? "").trim();

  return {
    type: String(formData.get("type")),
    status: String(formData.get("status")),
    title: String(formData.get("title") ?? "").trim(),
    synopsis: String(formData.get("synopsis") ?? "").trim(),
    releaseYear: Number(formData.get("releaseYear")),
    rating: String(formData.get("rating") ?? "").trim(),
    posterUrl: emptyToNull(formData.get("posterUrl")),
    backdropUrl: emptyToNull(formData.get("backdropUrl")),
    tmdbId: tmdbIdValue ? Number(tmdbIdValue) : null,
    genreSlugs
  };
}

export function AdminConsole({ genres, initialTitles }: AdminConsoleProps) {
  const [titles, setTitles] = useState(initialTitles);
  const [selectedTitleId, setSelectedTitleId] = useState(initialTitles[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [tmdbResults, setTmdbResults] = useState<TmdbSearchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({
    q: "",
    type: "",
    status: "",
    playback: ""
  });

  const selectedTitle = useMemo(
    () => titles.find((title) => title.id === selectedTitleId) ?? titles[0],
    [selectedTitleId, titles]
  );

  async function reloadTitles(nextSelectedId?: string, nextFilters = filters) {
    const response = await fetch(buildAdminTitlesPath(nextFilters));
    const body = await parseResponse<AdminTitle[]>(response);
    setTitles(body);
    setSelectedTitleId(nextSelectedId ?? body[0]?.id ?? "");
  }

  async function applyFilters(formData: FormData) {
    const nextFilters = {
      q: String(formData.get("q") ?? ""),
      type: String(formData.get("type") ?? ""),
      status: String(formData.get("status") ?? ""),
      playback: String(formData.get("playback") ?? "")
    };

    setFilters(nextFilters);
    setUpload(null);
    await reloadTitles(undefined, nextFilters);
  }

  async function clearFilters() {
    const nextFilters = {
      q: "",
      type: "",
      status: "",
      playback: ""
    };

    setFilters(nextFilters);
    setUpload(null);
    await reloadTitles(undefined, nextFilters);
  }

  const currentCoverage = coverageSummary(titles);

  async function createTitle(formData: FormData) {
    setBusy(true);
    setMessage(null);

    try {
      const payload = titlePayloadFromForm(formData, genres);
      const created = await parseResponse<AdminTitle>(
        await fetch("/api/admin/titles", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        })
      );

      await reloadTitles(created.id);
      setMessage("Titulo criado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar titulo.");
    } finally {
      setBusy(false);
    }
  }

  async function searchTmdb(formData: FormData) {
    const query = String(formData.get("q") ?? "").trim();
    const type = String(formData.get("type") ?? "movie");

    if (!query) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const params = new URLSearchParams({
        q: query,
        type
      });
      const results = await parseResponse<TmdbSearchItem[]>(
        await fetch(`/api/admin/tmdb/search?${params.toString()}`)
      );

      setTmdbResults(results);
      setMessage(`${results.length} resultado(s) encontrados no TMDB.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao buscar no TMDB.");
    } finally {
      setBusy(false);
    }
  }

  async function importTmdb(item: TmdbSearchItem) {
    setBusy(true);
    setMessage(null);

    try {
      const imported = await parseResponse<AdminTitle>(
        await fetch("/api/admin/tmdb/import", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            tmdbId: item.id,
            type: item.mediaType,
            withDemoAsset: true,
            maxSeasons: 1,
            maxEpisodesPerSeason: 6
          })
        })
      );

      await reloadTitles(imported.id);
      setTmdbResults([]);
      setMessage("Titulo importado com asset HLS demo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao importar do TMDB.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTitle(formData: FormData) {
    if (!selectedTitle) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const payload = titlePayloadFromForm(formData, genres);
      const updated = await parseResponse<AdminTitle>(
        await fetch(`/api/admin/titles/${selectedTitle.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        })
      );

      await reloadTitles(updated.id);
      setMessage("Titulo atualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar titulo.");
    } finally {
      setBusy(false);
    }
  }

  async function archiveTitle() {
    if (!selectedTitle) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const updated = await parseResponse<AdminTitle>(
        await fetch(`/api/admin/titles/${selectedTitle.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ status: "ARCHIVED" })
        })
      );

      await reloadTitles(updated.id);
      setMessage("Titulo arquivado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao arquivar titulo.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTitle() {
    if (!selectedTitle) {
      return;
    }

    const confirmed = window.confirm(
      `Excluir definitivamente "${selectedTitle.title}"? Esta acao remove episodios, assets e vinculos relacionados.`
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await parseEmptyResponse(
        await fetch(`/api/admin/titles/${selectedTitle.id}`, {
          method: "DELETE"
        })
      );
      setUpload(null);
      await reloadTitles();
      setMessage("Titulo excluido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao excluir titulo.");
    } finally {
      setBusy(false);
    }
  }

  async function addEpisode(formData: FormData) {
    if (!selectedTitle) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await parseResponse<AdminEpisode>(
        await fetch(`/api/admin/titles/${selectedTitle.id}/episodes`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            season: Number(formData.get("season")),
            number: Number(formData.get("number")),
            durationS: Number(formData.get("durationS"))
          })
        })
      );
      await reloadTitles(selectedTitle.id);
      setMessage("Episodio criado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar episodio.");
    } finally {
      setBusy(false);
    }
  }

  async function updateEpisode(episodeId: string, formData: FormData) {
    if (!selectedTitle) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await parseResponse<AdminEpisode>(
        await fetch(`/api/admin/episodes/${episodeId}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            season: Number(formData.get("season")),
            number: Number(formData.get("number")),
            durationS: Number(formData.get("durationS"))
          })
        })
      );
      await reloadTitles(selectedTitle.id);
      setMessage("Episodio atualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar episodio.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEpisode(episode: AdminEpisode) {
    if (!selectedTitle) {
      return;
    }

    const confirmed = window.confirm(`Excluir episodio T${episode.season}:E${episode.number}?`);

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await parseEmptyResponse(
        await fetch(`/api/admin/episodes/${episode.id}`, {
          method: "DELETE"
        })
      );
      await reloadTitles(selectedTitle.id);
      setMessage("Episodio excluido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao excluir episodio.");
    } finally {
      setBusy(false);
    }
  }

  async function requestUpload(formData: FormData) {
    if (!selectedTitle) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const episodeId = String(formData.get("episodeId") ?? "").trim();
      const payload = {
        contentType: String(formData.get("contentType") ?? "video/mp4"),
        fileName: String(formData.get("fileName") ?? "original.mp4"),
        ...(episodeId ? { episodeId } : {})
      };
      const data = await parseResponse<UploadResponse>(
        await fetch(`/api/admin/titles/${selectedTitle.id}/upload`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        })
      );

      setUpload(data);
      setMessage("URL de upload gerada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao gerar upload.");
    } finally {
      setBusy(false);
    }
  }

  async function completeUpload(formData: FormData) {
    if (!selectedTitle || !upload) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const episodeId = String(formData.get("episodeId") ?? "").trim();
      const data = await parseResponse<QueueResponse>(
        await fetch(`/api/admin/titles/${selectedTitle.id}/upload/complete`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            s3Key: upload.s3Key,
            ...(episodeId ? { episodeId } : {})
          })
        })
      );

      await reloadTitles(selectedTitle.id);
      setMessage(`Transcodificacao enfileirada: ${data.jobId ?? data.status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao concluir upload.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-grid">
      <div className="admin-panel admin-list-panel">
        <div className="panel-heading-row">
          <div>
            <p className="panel-label">Catalogo</p>
            <h2>{titles.length} titulo{titles.length === 1 ? "" : "s"}</h2>
          </div>
          <button className="secondary-action" disabled={busy} onClick={() => reloadTitles()}>
            Atualizar
          </button>
        </div>

        <form
          className="admin-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            void applyFilters(new FormData(event.currentTarget));
          }}
        >
          <label>
            Busca
            <input defaultValue={filters.q} name="q" placeholder="Nome do titulo" />
          </label>
          <label>
            Tipo
            <select defaultValue={filters.type} name="type">
              <option value="">Todos</option>
              <option value="MOVIE">Filmes</option>
              <option value="SERIES">Series</option>
            </select>
          </label>
          <label>
            Status
            <select defaultValue={filters.status} name="status">
              <option value="">Todos</option>
              <option value="DRAFT">Rascunho</option>
              <option value="PROCESSING">Processando</option>
              <option value="READY">Pronto</option>
              <option value="ARCHIVED">Arquivado</option>
            </select>
          </label>
          <label>
            Playback
            <select defaultValue={filters.playback} name="playback">
              <option value="">Todos</option>
              <option value="HLS">Movth</option>
              <option value="EMBED">Fonte externa</option>
              <option value="MISSING">Sem playback</option>
            </select>
          </label>
          <button className="secondary-action" disabled={busy} type="submit">
            Filtrar
          </button>
          <button className="text-action" disabled={busy} onClick={clearFilters} type="button">
            Limpar
          </button>
        </form>

        <div className="admin-coverage-strip">
          <span>Movth: {currentCoverage.hls}</span>
          <span>Fonte externa: {currentCoverage.embed}</span>
          <span>Sem playback: {currentCoverage.missing}</span>
        </div>

        <div className="admin-table">
          {titles.length > 0 ? titles.map((title) => (
            <button
              className={title.id === selectedTitle?.id ? "admin-row is-selected" : "admin-row"}
              key={title.id}
              onClick={() => {
                setSelectedTitleId(title.id);
                setUpload(null);
              }}
              type="button"
            >
              <span>
                <strong>{title.title}</strong>
                <small>
                  {title.releaseYear} - {title.type === "MOVIE" ? "Filme" : "Serie"}
                </small>
              </span>
              <span>{statusLabel(title.status)}</span>
              <span>
                {playbackSummary(title).total} asset(s)
                <small>{playbackLabel(title)}</small>
              </span>
            </button>
          )) : <p className="empty-state">Nenhum titulo encontrado com esses filtros.</p>}
        </div>
      </div>

      <form
        className="admin-panel admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createTitle(new FormData(event.currentTarget));
          event.currentTarget.reset();
        }}
      >
        <div>
          <p className="panel-label">Novo titulo</p>
          <h2>Criar registro</h2>
        </div>
        <div className="admin-form-grid">
          <label>
            Nome
            <input name="title" required />
          </label>
          <label>
            Tipo
            <select name="type" required>
              <option value="MOVIE">Filme</option>
              <option value="SERIES">Serie</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" required>
              <option value="DRAFT">Rascunho</option>
              <option value="PROCESSING">Processando</option>
              <option value="READY">Pronto</option>
              <option value="ARCHIVED">Arquivado</option>
            </select>
          </label>
          <label>
            Ano
            <input defaultValue={2026} min={1888} name="releaseYear" required type="number" />
          </label>
          <label>
            Classificacao
            <input defaultValue="14" name="rating" required />
          </label>
          <label>
            TMDB ID
            <input min={1} name="tmdbId" type="number" />
          </label>
        </div>
        <label>
          Sinopse
          <textarea name="synopsis" required rows={4} />
        </label>
        <label>
          Poster URL
          <input name="posterUrl" type="url" />
        </label>
        <label>
          Backdrop URL
          <input name="backdropUrl" type="url" />
        </label>
        <div className="admin-check-grid">
          {genres.map((genre) => (
            <label className="checkbox-row" key={genre.id}>
              <input name={`genre:${genre.slug}`} type="checkbox" />
              {genre.name}
            </label>
          ))}
        </div>
        <button className="primary-action" disabled={busy} type="submit">
          Criar titulo
        </button>
      </form>

      <div className="admin-panel admin-tmdb-panel">
        <div>
          <p className="panel-label">TMDB</p>
          <h2>Importar catalogo</h2>
        </div>
        <form
          className="admin-inline-form tmdb-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void searchTmdb(new FormData(event.currentTarget));
          }}
        >
          <label>
            Busca
            <input name="q" placeholder="Matrix, Breaking Bad..." required />
          </label>
          <label>
            Tipo
            <select defaultValue="movie" name="type" required>
              <option value="movie">Filme</option>
              <option value="tv">Serie</option>
            </select>
          </label>
          <button className="secondary-action" disabled={busy} type="submit">
            Buscar
          </button>
        </form>

        {tmdbResults.length > 0 ? (
          <div className="tmdb-results">
            {tmdbResults.map((item) => (
              <article className="tmdb-result" key={`${item.mediaType}:${item.id}`}>
                <div className="tmdb-poster">
                  {item.posterUrl ? (
                    <Image alt="" height={108} src={item.posterUrl} width={72} />
                  ) : (
                    item.title.slice(0, 1)
                  )}
                </div>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.releaseYear ?? "Ano indisponivel"} -{" "}
                    {item.mediaType === "movie" ? "Filme" : "Serie"}
                  </p>
                  <p>{item.synopsis || "Sinopse indisponivel."}</p>
                </div>
                <button className="primary-action" disabled={busy} onClick={() => importTmdb(item)} type="button">
                  Importar com demo
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="admin-panel admin-detail-panel">
        <div>
          <p className="panel-label">Selecionado</p>
          <h2>{selectedTitle?.title ?? "Nenhum titulo"}</h2>
        </div>
        {selectedTitle ? (
          <>
            <dl className="admin-facts">
              <div>
                <dt>Status</dt>
                <dd>{statusLabel(selectedTitle.status)}</dd>
              </div>
              <div>
                <dt>Episodios</dt>
                <dd>{selectedTitle.episodes.length}</dd>
              </div>
              <div>
                <dt>Assets</dt>
                <dd>{playbackSummary(selectedTitle).total}</dd>
              </div>
              <div>
                <dt>Playback</dt>
                <dd>{playbackLabel(selectedTitle)}</dd>
              </div>
              <div>
                <dt>Movth</dt>
                <dd>{playbackSummary(selectedTitle).hls}</dd>
              </div>
              <div>
                <dt>Fonte externa</dt>
                <dd>{playbackSummary(selectedTitle).embed}</dd>
              </div>
            </dl>

            <div className="admin-asset-list">
              <div className="panel-heading-row">
                <div>
                  <p className="panel-label">Assets</p>
                  <h2>Disponibilidade</h2>
                </div>
                <a className="secondary-action" href={`/title/${selectedTitle.id}`}>
                  Ver no catalogo
                </a>
              </div>
              {allVideoAssets(selectedTitle).length > 0 ? (
                allVideoAssets(selectedTitle).map((asset) => (
                  <div className="admin-asset-row" key={asset.id}>
                    <span>
                      <strong>{asset.quality}</strong>
                      <small>{asset.episodeId ? "Episodio" : "Titulo"}</small>
                    </span>
                    <span>
                      {asset.status}
                      <small>{sourceLabel(asset.source)}</small>
                    </span>
                    {asset.hlsManifestUrl ? (
                      <a href={asset.hlsManifestUrl} rel="noreferrer" target="_blank">
                        Abrir origem
                      </a>
                    ) : (
                      <span>Sem manifest</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="empty-state">Nenhum asset cadastrado para este titulo.</p>
              )}
            </div>

            <form
              className="admin-edit-form"
              key={selectedTitle.id}
              onSubmit={(event) => {
                event.preventDefault();
                void updateTitle(new FormData(event.currentTarget));
              }}
            >
              <div className="panel-heading-row">
                <div>
                  <p className="panel-label">Edicao</p>
                  <h2>Dados do titulo</h2>
                </div>
                <div className="admin-actions">
                  <button className="secondary-action" disabled={busy} type="button" onClick={archiveTitle}>
                    Arquivar
                  </button>
                  <button className="danger-action" disabled={busy} type="button" onClick={deleteTitle}>
                    Excluir
                  </button>
                </div>
              </div>
              <div className="admin-form-grid">
                <label>
                  Nome
                  <input defaultValue={selectedTitle.title} name="title" required />
                </label>
                <label>
                  Tipo
                  <select defaultValue={selectedTitle.type} name="type" required>
                    <option value="MOVIE">Filme</option>
                    <option value="SERIES">Serie</option>
                  </select>
                </label>
                <label>
                  Status
                  <select defaultValue={selectedTitle.status} name="status" required>
                    <option value="DRAFT">Rascunho</option>
                    <option value="PROCESSING">Processando</option>
                    <option value="READY">Pronto</option>
                    <option value="ARCHIVED">Arquivado</option>
                  </select>
                </label>
                <label>
                  Ano
                  <input
                    defaultValue={selectedTitle.releaseYear}
                    min={1888}
                    name="releaseYear"
                    required
                    type="number"
                  />
                </label>
                <label>
                  Classificacao
                  <input defaultValue={selectedTitle.rating} name="rating" required />
                </label>
                <label>
                  TMDB ID
                  <input defaultValue={selectedTitle.tmdbId ?? ""} min={1} name="tmdbId" type="number" />
                </label>
              </div>
              <label>
                Sinopse
                <textarea defaultValue={selectedTitle.synopsis} name="synopsis" required rows={4} />
              </label>
              <label>
                Poster URL
                <input defaultValue={selectedTitle.posterUrl ?? ""} name="posterUrl" type="url" />
              </label>
              <label>
                Backdrop URL
                <input defaultValue={selectedTitle.backdropUrl ?? ""} name="backdropUrl" type="url" />
              </label>
              <div className="admin-check-grid">
                {genres.map((genre) => (
                  <label className="checkbox-row" key={genre.id}>
                    <input
                      defaultChecked={selectedTitle.genres.some((entry) => entry.genre.slug === genre.slug)}
                      name={`genre:${genre.slug}`}
                      type="checkbox"
                    />
                    {genre.name}
                  </label>
                ))}
              </div>
              <button className="primary-action" disabled={busy} type="submit">
                Salvar alteracoes
              </button>
            </form>

            {selectedTitle.type === "SERIES" ? (
              <div className="episode-admin-section">
                <form
                  className="admin-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addEpisode(new FormData(event.currentTarget));
                    event.currentTarget.reset();
                  }}
                >
                  <label>
                    Temporada
                    <input defaultValue={1} min={1} name="season" required type="number" />
                  </label>
                  <label>
                    Episodio
                    <input
                      defaultValue={selectedTitle.episodes.length + 1}
                      min={1}
                      name="number"
                      required
                      type="number"
                    />
                  </label>
                  <label>
                    Duracao (s)
                    <input defaultValue={2400} min={1} name="durationS" required type="number" />
                  </label>
                  <button className="secondary-action" disabled={busy} type="submit">
                    Adicionar episodio
                  </button>
                </form>

                <div className="episode-admin-list">
                  {selectedTitle.episodes.map((episode) => (
                    <form
                      className="episode-admin-row"
                      key={episode.id}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void updateEpisode(episode.id, new FormData(event.currentTarget));
                      }}
                    >
                      <label>
                        Temporada
                        <input defaultValue={episode.season} min={1} name="season" required type="number" />
                      </label>
                      <label>
                        Episodio
                        <input defaultValue={episode.number} min={1} name="number" required type="number" />
                      </label>
                      <label>
                        Duracao (s)
                        <input
                          defaultValue={episode.durationS}
                          min={1}
                          name="durationS"
                          required
                          type="number"
                        />
                      </label>
                      <div className="admin-actions">
                        <button className="secondary-action" disabled={busy} type="submit">
                          Salvar
                        </button>
                        <button
                          className="danger-action"
                          disabled={busy}
                          type="button"
                          onClick={() => deleteEpisode(episode)}
                        >
                          Excluir
                        </button>
                      </div>
                    </form>
                  ))}
                </div>
              </div>
            ) : null}

            <form
              className="admin-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void requestUpload(new FormData(event.currentTarget));
              }}
            >
              {selectedTitle.type === "SERIES" ? (
                <label>
                  Episodio para upload
                  <select name="episodeId" required>
                    <option value="">Selecione</option>
                    {selectedTitle.episodes.map((episode) => (
                      <option key={episode.id} value={episode.id}>
                        T{episode.season}:E{episode.number}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                Arquivo
                <input defaultValue="original.mp4" name="fileName" required />
              </label>
              <label>
                Content-Type
                <input defaultValue="video/mp4" name="contentType" required />
              </label>
              <button className="secondary-action" disabled={busy} type="submit">
                Gerar URL S3
              </button>
            </form>

            {upload ? (
              <form
                className="upload-result"
                onSubmit={(event) => {
                  event.preventDefault();
                  void completeUpload(new FormData(event.currentTarget));
                }}
              >
                <p className="panel-label">Upload gerado</p>
                <code>{upload.s3Key}</code>
                <a href={upload.uploadUrl} rel="noreferrer" target="_blank">
                  Abrir presigned URL
                </a>
                {selectedTitle.type === "SERIES" ? (
                  <label>
                    Confirmar episodio
                    <select name="episodeId" required>
                      <option value="">Selecione</option>
                      {selectedTitle.episodes.map((episode) => (
                        <option key={episode.id} value={episode.id}>
                          T{episode.season}:E{episode.number}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button className="primary-action" disabled={busy} type="submit">
                  Marcar concluido
                </button>
              </form>
            ) : null}
          </>
        ) : null}

        {message ? <p className="admin-message">{message}</p> : null}
      </div>
    </section>
  );
}
