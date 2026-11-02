// Plex-friendly naming helpers. Pure functions, no DOM, so the web page and
// the future Chrome extension can share them.

const ILLEGAL_CHARS = /[<>"/\\|?*\u0000-\u001f]/g;

// Makes a title safe to use as a folder/file name on Windows, macOS, Linux and
// SMB shares: "Mission: Impossible" -> "Mission - Impossible".
export function sanitizeForFilename(title) {
	return String(title ?? "")
		.replace(/:\s+/g, " - ")
		.replace(/:/g, "-")
		.replace(ILLEGAL_CHARS, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\s*-\s*$/, "")
		.replace(/[. ]+$/, "");
}

// "Title (Year) {tmdb-ID}", the pattern Plex's matcher reads from folder and
// file names. The year is omitted when TMDB has no date.
export function buildPlexName({ title, year, id }) {
	const clean = sanitizeForFilename(title);
	const parts = [];

	if (clean) {
		parts.push(clean);
	}

	if (year) {
		parts.push(`(${year})`);
	}

	parts.push(`{tmdb-${id}}`);

	return parts.join(" ");
}
