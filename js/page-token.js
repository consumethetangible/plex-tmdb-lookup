// Where the web page keeps your TMDB token when it's hosted (e.g. GitHub Pages).
// The token lives in this browser's localStorage only. It is never put in the
// repo, and the page only ever sends it to api.themoviedb.org.
//
// Every function takes the storage as an argument so it can be tested; by
// default it uses the browser's localStorage. localStorage can be missing or
// throw (private windows, blocked site data), so every call is guarded and
// reports success with a boolean instead of throwing.

const KEY = "tmdbToken";

export function defaultStorage() {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

export function isPlaceholder(token) {
	const text = String(token ?? "").trim();

	return !text || text.startsWith("PASTE_");
}

export function readStoredToken(storage = defaultStorage()) {
	try {
		const value = String(storage?.getItem(KEY) ?? "").trim();

		return value || null;
	} catch {
		return null;
	}
}

// Returns true only if the token was really stored.
export function saveStoredToken(token, storage = defaultStorage()) {
	const value = String(token ?? "").trim();

	if (!value || !storage) {
		return false;
	}

	try {
		storage.setItem(KEY, value);

		return storage.getItem(KEY) === value;
	} catch {
		return false;
	}
}

export function clearStoredToken(storage = defaultStorage()) {
	try {
		storage?.removeItem(KEY);

		return true;
	} catch {
		return false;
	}
}
