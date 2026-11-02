// Popup startup: read the token from chrome.storage, then hand off to the
// shared search UI (the same one the web page uses).

import { createTmdbClient } from "./shared/core/tmdb.js";
import { mountSearchUI } from "./shared/ui/search-ui.js";
import { getToken } from "./storage.js";

const openSettings = () => chrome.runtime.openOptionsPage();

document.getElementById("settings").addEventListener("click", openSettings);
document.getElementById("open-settings").addEventListener("click", openSettings);

function showSetup() {
	document.getElementById("setup").hidden = false;
	document.getElementById("q").disabled = true;
	document.querySelector("#search-form button").disabled = true;
}

const token = await getToken();

if (!token) {
	showSetup();
} else {
	try {
		mountSearchUI({
			client: createTmdbClient({ token }),
			authHint: "Update it in settings (the gear icon).",
		});
	} catch {
		showSetup();
	}
}
