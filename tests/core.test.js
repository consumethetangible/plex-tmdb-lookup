import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPlexName, sanitizeForFilename } from "../js/core/plex.js";
import { normalize, yearOf } from "../js/core/results.js";
import { TmdbError, createTmdbClient } from "../js/core/tmdb.js";
import { lookup } from "../js/core/lookup.js";

const JWT_LIKE = "eyJhbGciOiJIUzI1NiJ9.payload.signature";
const V3_KEY = "0123456789abcdef0123456789abcdef";

// A fake fetch that records calls and answers from a route table.
function fakeFetch(routes) {
	const calls = [];

	async function fetchImpl(url, options = {}) {
		const parsed = new URL(url);
		calls.push({ path: parsed.pathname, params: Object.fromEntries(parsed.searchParams), headers: options.headers });

		const handler = routes[parsed.pathname];
		const { status = 200, body = {} } = typeof handler === "function" ? handler(parsed) : (handler ?? { status: 404 });

		return { status, ok: status >= 200 && status < 300, json: async () => body };
	}

	return { fetchImpl, calls };
}

describe("plex naming", () => {
	it("builds Title (Year) {tmdb-ID}", () => {
		assert.equal(buildPlexName({ title: "The Matrix", year: "1999", id: 603 }), "The Matrix (1999) {tmdb-603}");
	});

	it("omits the year when there isn't one", () => {
		assert.equal(buildPlexName({ title: "Untitled", year: "", id: 7 }), "Untitled {tmdb-7}");
	});

	it("makes titles safe for folders", () => {
		assert.equal(sanitizeForFilename("Mission: Impossible"), "Mission - Impossible");
		assert.equal(sanitizeForFilename("Face/Off"), "FaceOff");
		assert.equal(sanitizeForFilename('What "Is" This?'), "What Is This");
		assert.equal(sanitizeForFilename("2:22"), "2-22");
		assert.equal(sanitizeForFilename("Trailing dots..."), "Trailing dots");
		assert.equal(sanitizeForFilename("Dangling colon:"), "Dangling colon");
	});
});

describe("normalize", () => {
	it("reads a movie", () => {
		const item = normalize("movie", {
			id: 603,
			title: "The Matrix",
			original_title: "The Matrix",
			release_date: "1999-03-30",
			poster_path: "/p.jpg",
		});

		assert.equal(item.year, "1999");
		assert.equal(item.plexName, "The Matrix (1999) {tmdb-603}");
		assert.equal(item.tmdbUrl, "https://www.themoviedb.org/movie/603");
		assert.equal(item.imageUrl, "https://image.tmdb.org/t/p/w154/p.jpg");
		assert.deepEqual(item.details, []);
	});

	it("notes a different original title", () => {
		const item = normalize("movie", { id: 1, title: "Spirited Away", original_title: "千と千尋の神隠し", release_date: "2001-07-20" });

		assert.deepEqual(item.details, ["Original title: 千と千尋の神隠し"]);
	});

	it("reads a TV series from name and first_air_date", () => {
		const item = normalize("tv", { id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20" });

		assert.equal(item.title, "Breaking Bad");
		assert.equal(item.plexName, "Breaking Bad (2008) {tmdb-1396}");
	});

	it("gives people and collections no Plex name", () => {
		const person = normalize("person", {
			id: 6384,
			name: "Keanu Reeves",
			known_for_department: "Acting",
			known_for: [{ title: "John Wick" }, { name: "Some Show" }],
			profile_path: "/k.jpg",
		});

		assert.equal(person.plexName, "");
		assert.deepEqual(person.details, ["Acting", "Known for: John Wick, Some Show"]);
		assert.equal(normalize("collection", { id: 2344, name: "The Matrix Collection" }).plexName, "");
	});

	it("handles missing dates", () => {
		assert.equal(yearOf(undefined), "");
		assert.equal(yearOf(""), "");
		assert.equal(yearOf("2024-05-01"), "2024");
	});
});

describe("tmdb client", () => {
	it("sends a JWT-style token as a Bearer header", async () => {
		const { fetchImpl, calls } = fakeFetch({ "/3/search/movie": { body: { results: [] } } });
		const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });

		await client.search("movie", "matrix", 2);

		assert.equal(calls[0].headers.Authorization, `Bearer ${JWT_LIKE}`);
		assert.equal(calls[0].params.api_key, undefined);
		assert.equal(calls[0].params.query, "matrix");
		assert.equal(calls[0].params.page, "2");
	});

	it("sends a 32-char v3 key as api_key instead", async () => {
		const { fetchImpl, calls } = fakeFetch({ "/3/movie/603": { body: { id: 603 } } });
		const client = createTmdbClient({ token: V3_KEY, fetchImpl });

		await client.details("movie", 603);

		assert.equal(calls[0].params.api_key, V3_KEY);
		assert.equal(calls[0].headers.Authorization, undefined);
	});

	it("refuses to start without a real token", () => {
		assert.throws(() => createTmdbClient({ token: "" }), { kind: "auth" });
		assert.throws(() => createTmdbClient({ token: "PASTE_YOUR_API_READ_ACCESS_TOKEN_HERE" }), { kind: "auth" });
	});

	it("maps HTTP statuses to error kinds", async () => {
		for (const [status, kind] of [[401, "auth"], [404, "not-found"], [429, "rate-limit"], [500, "http"]]) {
			const { fetchImpl } = fakeFetch({ "/3/movie/1": { status } });
			const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });

			await assert.rejects(client.details("movie", 1), (error) => error instanceof TmdbError && error.kind === kind);
		}
	});

	it("ping hits /3/configuration and surfaces a bad token", async () => {
		const ok = fakeFetch({ "/3/configuration": { body: { images: {} } } });

		await createTmdbClient({ token: JWT_LIKE, fetchImpl: ok.fetchImpl }).ping();
		assert.equal(ok.calls[0].path, "/3/configuration");

		const bad = fakeFetch({ "/3/configuration": { status: 401 } });

		await assert.rejects(createTmdbClient({ token: JWT_LIKE, fetchImpl: bad.fetchImpl }).ping(), { kind: "auth" });
	});

	it("maps a failed fetch to a network error", async () => {
		const client = createTmdbClient({
			token: JWT_LIKE,
			fetchImpl: async () => {
				throw new TypeError("offline");
			},
		});

		await assert.rejects(client.details("movie", 1), { kind: "network" });
	});
});

describe("lookup", () => {
	const movieResults = (n) =>
		Array.from({ length: n }, (_, i) => ({ id: 100 + i, title: `Movie ${i}`, release_date: "2000-01-01" }));

	it("returns nothing for an empty query", async () => {
		const { fetchImpl, calls } = fakeFetch({});
		const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });
		const result = await lookup(client, { query: "   " });

		assert.deepEqual(result.groups, []);
		assert.equal(calls.length, 0);
	});

	it("searches all four types in the All view, capped per type", async () => {
		const { fetchImpl, calls } = fakeFetch({
			"/3/search/movie": { body: { results: movieResults(20), total_pages: 5 } },
			"/3/search/tv": { body: { results: [{ id: 1, name: "Show", first_air_date: "2010-01-01" }], total_pages: 1 } },
			"/3/search/collection": { body: { results: [], total_pages: 1 } },
			"/3/search/person": { body: { results: [{ id: 9, name: "Someone" }], total_pages: 1 } },
		});
		const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });
		const result = await lookup(client, { query: "thing" });

		assert.equal(calls.length, 4);
		assert.deepEqual(result.groups.map((group) => group.type), ["movie", "tv", "person"]);
		assert.equal(result.groups[0].items.length, 8);
		assert.equal(result.totalPages, 1);
		assert.deepEqual(result.idMatches, []);
	});

	it("searches only movies with the Movies filter and pages through them", async () => {
		const { fetchImpl, calls } = fakeFetch({
			"/3/search/movie": { body: { results: movieResults(20), total_pages: 5 } },
		});
		const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });
		const result = await lookup(client, { query: "thing", filter: "movies", page: 3 });

		assert.equal(calls.length, 1);
		assert.equal(calls[0].params.page, "3");
		assert.equal(result.groups[0].items.length, 20);
		assert.equal(result.totalPages, 5);
		assert.equal(result.page, 3);
	});

	it("expands shorthand aliases", async () => {
		const { fetchImpl, calls } = fakeFetch({ "/3/search/collection": { body: { results: [] } } });
		const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });

		await lookup(client, { query: "LOTR", filter: "collections" });

		assert.equal(calls[0].params.query, "lord of the rings");
	});

	it("treats a numeric query as an ID AND a title, skipping 404s", async () => {
		const { fetchImpl } = fakeFetch({
			"/3/movie/603": { body: { id: 603, title: "The Matrix", release_date: "1999-03-30" } },
			"/3/search/movie": { body: { results: [{ id: 5, title: "603 Days", release_date: "2011-01-01" }], total_pages: 1 } },
			"/3/search/tv": { body: { results: [], total_pages: 1 } },
			"/3/search/collection": { body: { results: [], total_pages: 1 } },
			"/3/search/person": { body: { results: [], total_pages: 1 } },
		});
		const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });
		const result = await lookup(client, { query: "603" });

		assert.equal(result.idMatches.length, 1);
		assert.equal(result.idMatches[0].plexName, "The Matrix (1999) {tmdb-603}");
		assert.equal(result.groups[0].items[0].title, "603 Days");
	});

	it("doesn't list an ID match twice", async () => {
		const { fetchImpl } = fakeFetch({
			"/3/movie/1917": { body: { id: 1917, title: "1917", release_date: "2019-12-25" } },
			"/3/search/movie": {
				body: {
					results: [
						{ id: 1917, title: "1917", release_date: "2019-12-25" },
						{ id: 7, title: "1917 Other", release_date: "2000-01-01" },
					],
				},
			},
		});
		const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });
		const result = await lookup(client, { query: "1917", filter: "movies" });

		assert.equal(result.idMatches.length, 1);
		assert.deepEqual(result.groups[0].items.map((item) => item.id), [7]);
	});

	it("skips the ID lookup on later pages", async () => {
		const { fetchImpl, calls } = fakeFetch({ "/3/search/movie": { body: { results: [], total_pages: 3 } } });
		const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });

		await lookup(client, { query: "300", filter: "movies", page: 2 });

		assert.deepEqual(calls.map((call) => call.path), ["/3/search/movie"]);
	});

	it("lets real failures through instead of hiding them", async () => {
		const { fetchImpl } = fakeFetch({ "/3/search/movie": { status: 401 }, "/3/movie/603": { status: 401 } });
		const client = createTmdbClient({ token: JWT_LIKE, fetchImpl });

		await assert.rejects(lookup(client, { query: "603", filter: "movies" }), { kind: "auth" });
	});
});
