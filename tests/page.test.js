import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { clearStoredToken, isPlaceholder, readStoredToken, saveStoredToken } from "../js/page-token.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");

function fakeStorage(initial = {}) {
	const data = { ...initial };

	return {
		data,
		getItem: (key) => (key in data ? data[key] : null),
		setItem: (key, value) => void (data[key] = String(value)),
		removeItem: (key) => void delete data[key],
	};
}

// A storage that refuses everything, like a locked-down private window.
const blockedStorage = {
	getItem() {
		throw new Error("blocked");
	},
	setItem() {
		throw new Error("blocked");
	},
	removeItem() {
		throw new Error("blocked");
	},
};

describe("page token storage", () => {
	it("saves, reads back (trimmed) and clears a token", () => {
		const storage = fakeStorage();

		assert.equal(readStoredToken(storage), null);
		assert.equal(saveStoredToken("  eyJabc.def.ghi  ", storage), true);
		assert.equal(storage.data.tmdbToken, "eyJabc.def.ghi");
		assert.equal(readStoredToken(storage), "eyJabc.def.ghi");
		assert.equal(clearStoredToken(storage), true);
		assert.equal(readStoredToken(storage), null);
	});

	it("refuses to store an empty token", () => {
		const storage = fakeStorage();

		assert.equal(saveStoredToken("   ", storage), false);
		assert.deepEqual(storage.data, {});
	});

	it("reports failure instead of throwing when storage is blocked or missing", () => {
		assert.equal(saveStoredToken("eyJabc", blockedStorage), false);
		assert.equal(readStoredToken(blockedStorage), null);
		assert.equal(clearStoredToken(blockedStorage), false);
		assert.equal(saveStoredToken("eyJabc", null), false);
		assert.equal(readStoredToken(null), null);
	});

	it("detects a write that silently didn't stick", () => {
		const forgetful = { getItem: () => null, setItem() {}, removeItem() {} };

		assert.equal(saveStoredToken("eyJabc", forgetful), false);
	});

	it("recognises placeholder and empty tokens", () => {
		assert.equal(isPlaceholder(""), true);
		assert.equal(isPlaceholder(undefined), true);
		assert.equal(isPlaceholder("PASTE_YOUR_API_READ_ACCESS_TOKEN_HERE"), true);
		assert.equal(isPlaceholder("eyJreal.token"), false);
	});
});

describe("index.html (the page that holds your token)", () => {
	const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
	const directives = Object.fromEntries(
		csp
			.split(";")
			.map((part) => part.trim().split(/\s+/))
			.filter(([name]) => name)
			.map(([name, ...values]) => [name, values]),
	);

	it("has a Content-Security-Policy", () => {
		assert.ok(csp, "missing CSP meta tag");
	});

	it("lets the page talk only to TMDB", () => {
		assert.deepEqual(directives["connect-src"], ["https://api.themoviedb.org"]);
		assert.deepEqual(directives["default-src"], ["'none'"]);
	});

	it("allows only its own scripts and styles (no inline, no eval, no remote)", () => {
		assert.deepEqual(directives["script-src"], ["'self'"]);
		assert.deepEqual(directives["style-src"], ["'self'"]);
	});

	it("loads posters only from this site and TMDB's image server", () => {
		assert.ok(directives["img-src"].every((source) => ["'self'", "data:", "https://image.tmdb.org"].includes(source)));
	});

	it("has no inline scripts, inline handlers or remote scripts", () => {
		assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
		assert.doesNotMatch(html, /<script[^>]*src="https?:/i);
		assert.doesNotMatch(html, /\son[a-z]+=/i);
		assert.doesNotMatch(html, /\sstyle="/i);
	});

	it("has no analytics", () => {
		assert.doesNotMatch(html, /goatcounter|google-analytics|gtag|plausible/i);
	});

	it("references local files that exist", () => {
		for (const [, url] of html.matchAll(/(?:src|href)="(\.[^"]+)"/g)) {
			assert.ok(existsSync(path.join(ROOT, url)), `index.html references missing ${url}`);
		}
	});

	it("keeps the elements the shared UI and app.js depend on", () => {
		for (const id of ["search-form", "q", "status", "results", "load-more", "setup", "token-form", "token", "token-status", "token-clear", "token-close", "token-toggle"]) {
			assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
		}
	});
});

describe("stylesheet", () => {
	it("makes the `hidden` attribute win over display rules (otherwise 'Load more' shows on every screen)", () => {
		const css = readFileSync(path.join(ROOT, "css/styles.css"), "utf8");

		assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
	});
});

describe("repo hygiene", () => {
	it("ignores the local token file", () => {
		assert.match(readFileSync(path.join(ROOT, ".gitignore"), "utf8"), /^js\/config\.local\.js$/m);
	});

	it("never mentions a real-looking token in the page code", () => {
		for (const file of ["js/app.js", "js/page-token.js", "index.html"]) {
			assert.doesNotMatch(readFileSync(path.join(ROOT, file), "utf8"), /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, file);
		}
	});
});
