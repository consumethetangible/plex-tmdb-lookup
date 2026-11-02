// Thin TMDB v3 client. It never reads a token from anywhere itself: the caller
// passes the credential in, so this same module works in the web page (token
// from config.local.js) and in the Chrome extension (token from
// chrome.storage).

const DEFAULT_BASE_URL = "https://api.themoviedb.org";

export class TmdbError extends Error {
	// kind: "auth" | "rate-limit" | "not-found" | "network" | "http"
	constructor(message, { status = 0, kind = "http" } = {}) {
		super(message);
		this.name = "TmdbError";
		this.status = status;
		this.kind = kind;
	}
}

// TMDB gives you two credentials. The long "API Read Access Token" is a JWT
// sent as a Bearer header; the short 32-character "API Key" goes in the URL.
function looksLikeV3ApiKey(credential) {
	return /^[a-f0-9]{32}$/i.test(credential);
}

export function createTmdbClient({ token, fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE_URL } = {}) {
	const credential = String(token ?? "").trim();

	if (!credential || credential.startsWith("PASTE_")) {
		throw new TmdbError("No TMDB token configured.", { kind: "auth" });
	}

	const useApiKeyParam = looksLikeV3ApiKey(credential);

	async function get(path, params = {}) {
		const url = new URL(path, baseUrl);
		const headers = { Accept: "application/json" };

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null && value !== "") {
				url.searchParams.set(key, String(value));
			}
		}

		if (useApiKeyParam) {
			url.searchParams.set("api_key", credential);
		} else {
			headers.Authorization = `Bearer ${credential}`;
		}

		let response;

		try {
			response = await fetchImpl(url.toString(), { headers });
		} catch {
			throw new TmdbError("Could not reach TMDB.", { kind: "network" });
		}

		if (response.status === 401) {
			throw new TmdbError("TMDB rejected the token.", { status: 401, kind: "auth" });
		}

		if (response.status === 404) {
			throw new TmdbError("Not found.", { status: 404, kind: "not-found" });
		}

		if (response.status === 429) {
			throw new TmdbError("TMDB is rate limiting requests.", { status: 429, kind: "rate-limit" });
		}

		if (!response.ok) {
			throw new TmdbError(`TMDB returned HTTP ${response.status}.`, { status: response.status });
		}

		return response.json();
	}

	return {
		// type: "movie" | "tv" | "collection" | "person"
		search: (type, query, page = 1) => get(`/3/search/${type}`, { query, page, include_adult: "false" }),
		details: (type, id) => get(`/3/${type}/${id}`),
		// Cheapest authenticated call; used by the extension's "Test token" button.
		ping: () => get("/3/configuration"),
	};
}
