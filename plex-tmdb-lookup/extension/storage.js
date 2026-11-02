// Where the extension keeps your TMDB token.
// chrome.storage.local stays on this computer. (chrome.storage.sync would copy
// the token to your Google account, which we don't want.)

const TOKEN_KEY = "tmdbToken";

export async function getToken() {
	const stored = await chrome.storage.local.get(TOKEN_KEY);

	return String(stored[TOKEN_KEY] ?? "").trim();
}

export async function setToken(token) {
	await chrome.storage.local.set({ [TOKEN_KEY]: String(token).trim() });
}

export async function clearToken() {
	await chrome.storage.local.remove(TOKEN_KEY);
}
