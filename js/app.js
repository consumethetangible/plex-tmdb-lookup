// Web page startup. Finds your TMDB token, then hands off to the shared search UI
// (the Chrome extension does the same, reading its token from chrome.storage).
//
// Token sources, in order:
//   1. Saved in this browser (localStorage). This is how the hosted page works:
//      you paste your own token once, and it never touches the repo.
//   2. js/config.local.js, an optional gitignored file for running locally.
//
// All TMDB traffic goes straight from this page to api.themoviedb.org.

import { createTmdbClient } from "./core/tmdb.js";
import { clearStoredToken, isPlaceholder, readStoredToken, saveStoredToken } from "./page-token.js";
import { mountSearchUI } from "./ui/search-ui.js";

const $ = (id) => document.getElementById(id);

const setupBox = $("setup");
const setupTitle = $("setup-title");
const tokenForm = $("token-form");
const tokenInput = $("token");
const tokenStatus = $("token-status");
const clearButton = $("token-clear");
const closeButton = $("token-close");
const toggleButton = $("token-toggle");
const searchInput = $("q");
const searchButton = document.querySelector("#search-form button");

let mounted = false;

function say(message, kind = "") {
	tokenStatus.textContent = message;
	tokenStatus.className = `status ${kind}`.trim();
	tokenStatus.hidden = !message;
}

function setSearchEnabled(enabled) {
	searchInput.disabled = !enabled;
	searchButton.disabled = !enabled;
}

async function loadLocalFileToken() {
	try {
		const module = await import("./config.local.js");

		return isPlaceholder(module.TMDB_TOKEN) ? null : String(module.TMDB_TOKEN).trim();
	} catch {
		return null;
	}
}

function startSearch(token, authHint) {
	setSearchEnabled(true);
	mountSearchUI({ client: createTmdbClient({ token }), authHint });
	mounted = true;
}

async function saveAndTest(event) {
	event.preventDefault();

	const token = tokenInput.value.trim();

	if (!token) {
		say("Paste a token first.", "error");

		return;
	}

	say("Checking with TMDB…");

	let verified = false;

	try {
		await createTmdbClient({ token }).ping();
		verified = true;
	} catch (error) {
		if (error?.kind === "auth") {
			say("TMDB rejected that token. Make sure you copied all of it.", "error");

			return;
		}

		// Offline or rate limited: not the token's fault, so keep it and carry on.
	}

	const stored = saveStoredToken(token);

	tokenInput.value = "";

	// A search that's already running holds the old token, so swapping tokens
	// means a fresh load. If the browser wouldn't save it, a reload would just
	// bring the old token back, so say so and leave things as they are.
	if (mounted) {
		if (stored) {
			location.reload();
		} else {
			say("This browser blocked saving the token, so nothing changed.", "error");
		}

		return;
	}

	startSearch(token, 'Open "Token" at the top to replace it.');
	toggleButton.hidden = false;

	if (!stored) {
		keepSettingsOpen({ hasSavedToken: false });
		say("This browser blocked saving the token, so it will only last until you close this tab.", "error");
	} else if (!verified) {
		keepSettingsOpen({ hasSavedToken: true });
		say("Saved, but I couldn't reach TMDB to verify it. Try a search.");
	} else {
		setupBox.hidden = true;
		say("");
	}
}

// Leaves the settings box visible (with Close) so a message in it can be read.
function keepSettingsOpen({ hasSavedToken }) {
	setupTitle.textContent = "TMDB token";
	clearButton.hidden = !hasSavedToken;
	closeButton.hidden = false;
	setupBox.hidden = false;
}

function openSettings({ hasSavedToken }) {
	keepSettingsOpen({ hasSavedToken });
	say(hasSavedToken ? "A token is saved in this browser. Paste a new one to replace it." : "Using the token from js/config.local.js. Paste one here to use that instead.");
	tokenInput.focus();
}

tokenForm.addEventListener("submit", saveAndTest);

toggleButton.addEventListener("click", () => {
	if (setupBox.hidden) {
		openSettings({ hasSavedToken: Boolean(readStoredToken()) });
	} else {
		setupBox.hidden = true;
		say("");
	}
});

clearButton.addEventListener("click", () => {
	clearStoredToken();
	location.reload();
});

closeButton.addEventListener("click", () => {
	setupBox.hidden = true;
	say("");
});

async function boot() {
	const stored = readStoredToken();
	const token = stored || (await loadLocalFileToken());

	if (!token) {
		setSearchEnabled(false);
		setupBox.hidden = false;
		tokenInput.focus();

		return;
	}

	toggleButton.hidden = false;
	startSearch(token, 'Open "Token" at the top to replace it.');
}

boot();
