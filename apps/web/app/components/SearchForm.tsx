"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

type SearchFormProps = {
  genres?: Array<{
    name: string;
    slug: string;
  }>;
};

export function SearchForm({ genres = [] }: SearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [type, setType] = useState(searchParams.get("type") ?? "");
  const [genre, setGenre] = useState(searchParams.get("genre") ?? "");
  const hasFilters = Boolean(query || type || genre);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (type) {
      params.set("type", type);
    }

    if (genre) {
      params.set("genre", genre);
    }

    router.push(`/search${params.toString() ? `?${params.toString()}` : ""}` as Route);
  }

  function clearFilters() {
    setQuery("");
    setType("");
    setGenre("");
    router.push("/search" as Route);
  }

  return (
    <form className="search-form" onSubmit={submit}>
      <label className="search-input-label">
        Busca
        <input
          autoComplete="off"
          name="q"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Titulo, serie ou filme"
          value={query}
        />
      </label>
      <label>
        Tipo
        <select name="type" onChange={(event) => setType(event.target.value)} value={type}>
          <option value="">Todos</option>
          <option value="MOVIE">Filmes</option>
          <option value="SERIES">Series</option>
        </select>
      </label>
      <label>
        Genero
        <select name="genre" onChange={(event) => setGenre(event.target.value)} value={genre}>
          <option value="">Todos</option>
          {genres.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <button className="primary-action" type="submit">
        Buscar
      </button>
      {hasFilters ? (
        <button className="secondary-action" onClick={clearFilters} type="button">
          Limpar
        </button>
      ) : null}
    </form>
  );
}
