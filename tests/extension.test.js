import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { findDrift } from "../scripts/sync-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT = path.join(ROOT, "extension");

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);

		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

const manifest = JSON.parse(readFileSync(path.join(EXT, "manifest.json"), "utf8"));

describe("extension shared code", () => {
	it("is in sync with js/core, js/ui and css/styles.css", () => {
		assert.deepEqual(findDrift(ROOT), [], "run `npm run sync`");
	});
});

describe("extension manifest", () => {
	it("is Manifest V3", () => {
		assert.equal(manifest.manifest_version, 3);
	});

	it("asks for the bare minimum permissions (guards against permission creep)", () => {
		assert.deepEqual(manifest.permissions, ["storage"]);
		assert.deepEqual(manifest.host_permissions, ["https://api.themoviedb.org/*"]);
		assert.equal(manifest.content_scripts, undefined);
		assert.equal(manifest.background, undefined);
	});

	it("points at files that exist", () => {
		const referenced = [
			manifest.action.default_popup,
			manifest.options_ui.page,
			...Object.values(manifest.icons),
			...Object.values(manifest.action.default_icon),
		];

		for (const file of referenced) {
			assert.ok(existsSync(path.join(EXT, file)), `missing ${file}`);
		}
	});
});

describe("extension pages", () => {
	const pages = ["popup.html", "options.html"];

	it("only reference local files that exist", () => {
		for (const page of pages) {
			const html = readFileSync(path.join(EXT, page), "utf8");

			for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
				if (/^(https?:|#|mailto:)/.test(url)) {
					continue;
				}

				assert.ok(existsSync(path.join(EXT, url)), `${page} references missing ${url}`);
			}
		}
	});

	it("have no inline scripts or remote scripts (Manifest V3 blocks both)", () => {
		for (const page of pages) {
			const html = readFileSync(path.join(EXT, page), "utf8");

			assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i, `${page} has an inline script`);
			assert.doesNotMatch(html, /<script[^>]*src="https?:/i, `${page} loads a remote script`);
			assert.doesNotMatch(html, /\son[a-z]+=/i, `${page} has an inline event handler`);
		}
	});

	it("only import modules that exist", () => {
		const jsFiles = walk(EXT).filter((file) => file.endsWith(".js"));

		assert.ok(jsFiles.length > 0);

		for (const file of jsFiles) {
			const source = readFileSync(file, "utf8");

			for (const [, specifier] of source.matchAll(/(?:from\s+|import\()\s*["'](\.[^"']+)["']/g)) {
				assert.ok(existsSync(path.resolve(path.dirname(file), specifier)), `${path.relative(ROOT, file)} imports missing ${specifier}`);
			}
		}
	});

	it("never log the token or sync it to Google", () => {
		// Ignore comment lines so a comment *explaining* a rule doesn't trip it.
		const withoutComments = (text) =>
			text
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.split("\n")
				.filter((line) => !line.trim().startsWith("//"))
				.join("\n");

		for (const file of walk(EXT).filter((f) => f.endsWith(".js"))) {
			const source = withoutComments(readFileSync(file, "utf8"));

			assert.doesNotMatch(source, /console\.\w+\([^)]*token/i, `${path.relative(ROOT, file)} may log the token`);
			assert.doesNotMatch(source, /storage\.sync/, `${path.relative(ROOT, file)} would sync the token to Google`);
		}
	});
});
