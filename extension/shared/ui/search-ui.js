// The search UI, shared by the web page and the Chrome extension popup.
// The host page supplies the markup (fixed element IDs) and a TMDB client;
// this module wires up searching, rendering and the copy buttons.
// All text from TMDB is inserted with textContent (never innerHTML).

import { lookup } from "../core/lookup.js";
import { TYPE_BADGES, TYPE_LABELS } from "../core/results.js";

function el(tag, { className, text, attrs } = {}, children = []) {
	const node = document.createElement(tag);

	if (className) {
		node.className = className;
	}

	if (text !== undefined) {
		node.textContent = String(text);
	}

	for (const [name, value] of Object.entries(attrs || {})) {
		node.setAttribute(name, String(value));
	}

	node.append(...children.filter(Boolean));

	return node;
}

// --- copying ---------------------------------------------------------------

function fallbackCopy(text) {
	const area = el("textarea", { attrs: { readonly: "" } });

	area.value = text;
	area.style.cssText = "position:fixed;left:-9999px";
	document.body.append(area);
	area.select();

	const ok = typeof document.execCommand === "function" && document.execCommand("copy");

	area.remove();

	return ok;
}

function flash(button, label) {
	button.dataset.label ??= button.textContent;
	button.textContent = label;
	clearTimeout(button.flashTimer);
	button.flashTimer = setTimeout(() => {
		button.textContent = button.dataset.label;
	}, 1500);
}

async function copyText(text, button) {
	let ok = false;

	try {
		await navigator.clipboard.writeText(text);
		ok = true;
	} catch {
		ok = fallbackCopy(text);
	}

	flash(button, ok ? "Copied!" : "Copy failed");
}

function copyButton(label, text, className = "") {
	const button = el("button", { className, text: label, attrs: { type: "button" } });

	button.addEventListener("click", () => copyText(text, button));

	return button;
}

// --- rendering -------------------------------------------------------------

function renderCard(item) {
	const poster = item.imageUrl
		? el("img", { className: "poster", attrs: { src: item.imageUrl, alt: "", loading: "lazy" } })
		: el("div", { className: "poster empty", text: "No image" });

	const titleRow = el("div", { className: "title-row" }, [
		el("h3", { className: "title", text: item.title || "(untitled)" }),
		item.year ? el("span", { className: "year", text: `(${item.year})` }) : null,
		el("span", { className: "badge", text: TYPE_BADGES[item.type] }),
	]);

	const actions = el("div", { className: "actions" }, [
		copyButton(`ID ${item.id}`, String(item.id), "id-button"),
		item.plexName ? copyButton("Copy Plex name", item.plexName) : null,
		el("a", {
			className: "link-button",
			text: "Open on TMDB",
			attrs: { href: item.tmdbUrl, target: "_blank", rel: "noopener noreferrer" },
		}),
	]);

	const body = el("div", {}, [
		titleRow,
		...item.details.map((line) => el("p", { className: "meta", text: line })),
		item.plexName ? el("p", { className: "plex", text: item.plexName }) : null,
		actions,
	]);

	return el("article", { className: "card" }, [poster, body]);
}

function renderSection(key, heading, items) {
	const cards = el("div", { className: "cards" }, items.map(renderCard));
	const section = el("section", { className: "group" }, [el("h2", { text: heading }), cards]);

	section.dataset.group = key;

	return section;
}

// --- mounting --------------------------------------------------------------

// Expects these elements in `root`: #search-form, #q, #status, #results,
// #load-more, and any number of .chip[data-filter] buttons.
// options.authHint: what to tell the user when TMDB rejects the token.
export function mountSearchUI({ client, root = document, authHint = "Check your TMDB token." } = {}) {
	const form = root.getElementById("search-form");
	const input = root.getElementById("q");
	const statusBox = root.getElementById("status");
	const resultsBox = root.getElementById("results");
	const moreButton = root.getElementById("load-more");
	const chips = [...root.querySelectorAll(".chip")];
	const state = { filter: "all", page: 1, totalPages: 1, requestId: 0 };

	function setStatus(message, kind = "") {
		statusBox.textContent = message;
		statusBox.className = `status ${kind}`.trim();
		statusBox.hidden = !message;
	}

	function describeError(error) {
		switch (error?.kind) {
			case "auth":
				return `TMDB rejected the token. ${authHint}`;
			case "rate-limit":
				return "TMDB is rate limiting you. Wait a few seconds and try again.";
			case "network":
				return "Couldn't reach TMDB. Check your connection.";
			default:
				return error?.status ? `TMDB returned an error (HTTP ${error.status}).` : "Something went wrong with that lookup.";
		}
	}

	function renderResults(data, { append }) {
		if (!append) {
			resultsBox.replaceChildren();

			if (data.idMatches.length) {
				resultsBox.append(renderSection("id", "Exact ID match", data.idMatches));
			}
		}

		for (const group of data.groups) {
			const existing = append ? resultsBox.querySelector(`[data-group="${group.type}"] .cards`) : null;

			if (existing) {
				existing.append(...group.items.map(renderCard));
			} else {
				resultsBox.append(renderSection(group.type, TYPE_LABELS[group.type], group.items));
			}
		}
	}

	async function run(page = 1) {
		const query = input.value.trim();
		const requestId = ++state.requestId;

		if (!query) {
			resultsBox.replaceChildren();
			moreButton.hidden = true;
			setStatus("");

			return;
		}

		setStatus("Searching TMDB…");
		moreButton.disabled = true;

		try {
			const data = await lookup(client, { query, filter: state.filter, page });

			if (requestId !== state.requestId) {
				return;
			}

			const append = page > 1;
			const empty = !data.idMatches.length && !data.groups.length;

			if (empty && !append) {
				resultsBox.replaceChildren();
				setStatus(`Nothing found for “${query}”.`);
				moreButton.hidden = true;

				return;
			}

			renderResults(data, { append });
			setStatus("");
			state.page = data.page;
			state.totalPages = data.totalPages;
			moreButton.hidden = state.page >= state.totalPages;
		} catch (error) {
			if (requestId !== state.requestId) {
				return;
			}

			console.error(error);
			setStatus(describeError(error), "error");
		} finally {
			moreButton.disabled = false;
		}
	}

	function setFilter(filter) {
		state.filter = filter;

		for (const chip of chips) {
			const active = chip.dataset.filter === filter;

			chip.classList.toggle("active", active);
			chip.setAttribute("aria-pressed", String(active));
		}
	}

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		run(1);
	});

	for (const chip of chips) {
		chip.addEventListener("click", () => {
			setFilter(chip.dataset.filter);

			if (input.value.trim()) {
				run(1);
			}
		});
	}

	moreButton.addEventListener("click", () => run(state.page + 1));
	input.focus();

	return { focus: () => input.focus() };
}
