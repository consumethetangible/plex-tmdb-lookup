// Turns raw TMDB responses into one flat shape the UI can render.

import { buildPlexName } from "./plex.js";

export const TYPE_ORDER = ["movie", "tv", "collection", "person"];

export const TYPE_LABELS = {
	movie: "Movies",
	tv: "TV series",
	collection: "Movie collections",
	person: "People",
};

export const TYPE_BADGES = {
	movie: "Movie",
	tv: "TV",
	collection: "Collection",
	person: "Person",
};

// Filter chip -> which TMDB types it searches.
export const FILTERS = {
	all: TYPE_ORDER,
	movies: ["movie"],
	tv: ["tv"],
	collections: ["collection"],
	people: ["person"],
};

const IMAGE_BASE = "https://image.tmdb.org/t/p/w154";

export function yearOf(value) {
	const match = /^(\d{4})/.exec(String(value ?? ""));

	return match ? match[1] : "";
}

export function normalize(type, raw) {
	const isMovie = type === "movie";
	const isTv = type === "tv";
	const isPerson = type === "person";
	const id = raw.id;
	const title = (isMovie ? raw.title : raw.name) || "";
	const year = isMovie ? yearOf(raw.release_date) : isTv ? yearOf(raw.first_air_date) : "";
	const imagePath = isPerson ? raw.profile_path : raw.poster_path;
	const details = [];

	if (isMovie && raw.original_title && raw.original_title !== raw.title) {
		details.push(`Original title: ${raw.original_title}`);
	}

	if (isTv && raw.original_name && raw.original_name !== raw.name) {
		details.push(`Original title: ${raw.original_name}`);
	}

	if (isPerson) {
		if (raw.known_for_department) {
			details.push(raw.known_for_department);
		}

		const knownFor = (raw.known_for || [])
			.map((credit) => credit.title || credit.name)
			.filter(Boolean)
			.slice(0, 3);

		if (knownFor.length) {
			details.push(`Known for: ${knownFor.join(", ")}`);
		}
	}

	return {
		type,
		id,
		title,
		year,
		imageUrl: imagePath ? `${IMAGE_BASE}${imagePath}` : "",
		tmdbUrl: `https://www.themoviedb.org/${type}/${id}`,
		details,
		plexName: isMovie || isTv ? buildPlexName({ title, year, id }) : "",
	};
}
