// Web page startup: read the token from config.local.js, then hand off to the
// shared search UI. (The Chrome extension does the same, reading its token
// from chrome.storage instead.)

import { createTmdbClient } from "./core/tmdb.js";
import { mountSearchUI } from "./ui/search-ui.js";

async function loadToken() {
	try {
		const module = await import("./config.local.js");

		return module.TMDB_TOKEN;
	} catch {
		return null;
	}
}

async function boot() {
	const token = await loadToken();

	if (!token || String(token).startsWith("PASTE_")) {
		document.getElementById("setup").hidden = false;
		document.getElementById("q").disabled = true;
		document.querySelector("#search-form button").disabled = true;

		return;
	}

	mountSearchUI({
		client: createTmdbClient({ token }),
		authHint: "Check TMDB_TOKEN in js/config.local.js.",
	});
}

boot();
