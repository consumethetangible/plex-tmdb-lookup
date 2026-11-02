// Settings page: save, test and clear the TMDB token.

import { createTmdbClient } from "./shared/core/tmdb.js";
import { clearToken, getToken, setToken } from "./storage.js";

const form = document.getElementById("token-form");
const input = document.getElementById("token");
const statusBox = document.getElementById("status");

function say(message, kind = "") {
	statusBox.textContent = message;
	statusBox.className = `status ${kind}`.trim();
	statusBox.hidden = !message;
}

// Returns "ok", or an object describing why not.
async function check(token) {
	try {
		await createTmdbClient({ token }).ping();

		return "ok";
	} catch (error) {
		return error;
	}
}

function explain(error) {
	switch (error?.kind) {
		case "auth":
			return "TMDB rejected that token. Make sure you copied the whole thing.";
		case "network":
			return "Couldn't reach TMDB to check it.";
		case "rate-limit":
			return "TMDB is rate limiting you right now.";
		default:
			return "TMDB returned an unexpected error.";
	}
}

async function refreshSavedNote() {
	const saved = await getToken();

	input.placeholder = saved
		? "A token is saved. Paste a new one to replace it."
		: "Paste the long token starting with eyJ…";

	return Boolean(saved);
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();

	const token = input.value.trim();

	if (!token) {
		say("Paste a token first.", "error");

		return;
	}

	say("Checking with TMDB…");

	const result = await check(token);

	if (result !== "ok" && result?.kind === "auth") {
		say(explain(result), "error");

		return;
	}

	await setToken(token);
	input.value = "";
	await refreshSavedNote();

	if (result === "ok") {
		say("Token works and is saved. Open the popup from the toolbar to search.", "ok");
	} else {
		say(`Saved, but I couldn't verify it. ${explain(result)}`);
	}
});

document.getElementById("test").addEventListener("click", async () => {
	const token = input.value.trim() || (await getToken());

	if (!token) {
		say("There's no token to test yet.", "error");

		return;
	}

	say("Checking with TMDB…");

	const result = await check(token);

	if (result === "ok") {
		say(input.value.trim() ? "That token works. Press Save to keep it." : "The saved token works.", "ok");
	} else {
		say(explain(result), "error");
	}
});

document.getElementById("clear").addEventListener("click", async () => {
	await clearToken();
	input.value = "";
	await refreshSavedNote();
	say("Saved token cleared.");
});

if (await refreshSavedNote()) {
	say("A token is saved. You can test it or paste a new one.");
}
