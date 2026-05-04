"use client";

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
  videoAssets: TitleAsset[];
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

async function parseResponse<T>(response: Response) {
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "Falha na operacao");
  }

  return body.data;
}

export function AdminConsole({ genres, initialTitles }: AdminConsoleProps) {
  const [titles, setTitles] = useState(initialTitles);
  const [selectedTitleId, setSelectedTitleId] = useState(initialTitles[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedTitle = useMemo(
    () => titles.find((title) => title.id === selectedTitleId) ?? titles[0],
    [selectedTitleId, titles]
  );

  async function reloadTitles(nextSelectedId?: string) {
    const response = await fetch("/api/admin/titles?pageSize=100");
    const body = await parseResponse<AdminTitle[]>(response);
    setTitles(body);
    setSelectedTitleId(nextSelectedId ?? body[0]?.id ?? "");
  }

  async function createTitle(formData: FormData) {
    setBusy(true);
    setMessage(null);

    try {
      const genreSlugs = genres
        .filter((genre) => formData.get(`genre:${genre.slug}`) === "on")
        .map((genre) => genre.slug);
      const tmdbIdValue = String(formData.get("tmdbId") ?? "").trim();
      const payload = {
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

        <div className="admin-table">
          {titles.map((title) => (
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
              <span>{title.videoAssets.length} asset(s)</span>
            </button>
          ))}
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
                <dd>{selectedTitle.videoAssets.length}</dd>
              </div>
            </dl>

            {selectedTitle.type === "SERIES" ? (
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
