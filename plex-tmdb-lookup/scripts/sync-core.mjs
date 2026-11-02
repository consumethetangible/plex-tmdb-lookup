// Chrome extensions can only load files from inside their own folder, so the
// shared code (js/core, js/ui, css/styles.css) is COPIED into extension/shared.
//
//   node scripts/sync-core.mjs          copy the files over
//   node scripts/sync-core.mjs --check  exit 1 if the copies are out of date
//
// A test runs the same check, so a stale copy can't slip through.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DIR_MAP = [
	["js/core", "extension/shared/core"],
	["js/ui", "extension/shared/ui"],
];

export function syncPlan(root = ROOT) {
	const plan = [];

	for (const [fromDir, toDir] of DIR_MAP) {
		for (const name of readdirSync(path.join(root, fromDir))) {
			if (name.endsWith(".js")) {
				plan.push({ from: path.join(root, fromDir, name), to: path.join(root, toDir, name) });
			}
		}
	}

	plan.push({ from: path.join(root, "css/styles.css"), to: path.join(root, "extension/shared/styles.css") });

	return plan;
}

// Returns human-readable problems: missing/different copies, or leftovers in
// the destination that no longer exist in the source.
export function findDrift(root = ROOT) {
	const problems = [];
	const plan = syncPlan(root);

	for (const { from, to } of plan) {
		const rel = path.relative(root, to);

		if (!existsSync(to)) {
			problems.push(`missing: ${rel}`);
		} else if (!readFileSync(from).equals(readFileSync(to))) {
			problems.push(`out of date: ${rel}`);
		}
	}

	const expected = new Set(plan.map(({ to }) => to));

	for (const [, toDir] of DIR_MAP) {
		const dir = path.join(root, toDir);

		if (!existsSync(dir)) {
			continue;
		}

		for (const name of readdirSync(dir)) {
			if (name.endsWith(".js") && !expected.has(path.join(dir, name))) {
				problems.push(`stale: ${path.join(toDir, name)}`);
			}
		}
	}

	return problems;
}

export function sync(root = ROOT) {
	for (const { from, to } of syncPlan(root)) {
		mkdirSync(path.dirname(to), { recursive: true });
		copyFileSync(from, to);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	if (process.argv.includes("--check")) {
		const problems = findDrift();

		if (problems.length) {
			console.error(`extension/shared is out of sync:\n  ${problems.join("\n  ")}\nRun: npm run sync`);
			process.exit(1);
		}

		console.log("extension/shared is in sync.");
	} else {
		sync();
		console.log(`Copied ${syncPlan().length} files into extension/shared.`);
	}
}
