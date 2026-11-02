// The search logic: given a client and a query, return grouped results.
// Adapted in spirit from davecollections/tmdb-id-lookup (MIT). See NOTICE.md.

import { FILTERS, TYPE_ORDER, normalize } from "./results.js";

// Shorthand search terms, carried over from the original project.
export const COLLECTION_ALIASES = {
	lotr: "lord of the rings",
	hp: "harry potter",
	mcu: "marvel",
	dceu: "dc",
	bttf: "back to the future",
	mi: "mission impossible",
	tdk: "dark knight",
	potc: "pirates of the caribbean",
	sw: "star wars",
	jp: "jurassic park",
	jw: "jurassic world",
};

// In the "All" view, cap each section so one type can't crowd out the rest.
const ALL_VIEW_LIMITS = { movie: 8, tv: 5, collection: 3, person: 4 };
const PAGE_SIZE = 20;

// Numeric queries are looked up as an ID on every type. A 404 just means
// "no item with that ID of that type", which is normal, so it's skipped;
// anything else (bad token, rate limit, network) is a real failure.
async function lookupById(client, id, types) {
	const settled = await Promise.all(
		types.map(async (type) => {
			try {
				return normalize(type, await client.details(type, id));
			} catch (error) {
				if (error?.kind === "not-found") {
					return null;
				}

				throw error;
			}
		}),
	);

	return settled.filter(Boolean);
}

async function searchByText(client, term, types, page) {
	const single = types.length === 1;
	const requestPage = single ? page : 1;
	const responses = await Promise.all(types.map((type) => client.search(type, term, requestPage)));

	const groups = types
		.map((type, index) => {
			const results = responses[index]?.results ?? [];
			const limit = single ? PAGE_SIZE : ALL_VIEW_LIMITS[type];

			return { type, items: results.slice(0, limit).map((raw) => normalize(type, raw)) };
		})
		.filter((group) => group.items.length);

	return { groups, totalPages: single ? responses[0]?.total_pages ?? 1 : 1 };
}

// Returns { idMatches, groups, page, totalPages }.
//  - idMatches: items whose TMDB ID equals a numeric query (shown first).
//  - groups: title/name search results, one group per type.
// A numeric query runs BOTH, because plenty of titles are numbers ("1917",
// "300", "2012") and you want those findable too.
export async function lookup(client, { query, filter = "all", page = 1 } = {}) {
	const text = String(query ?? "").trim();

	if (!text) {
		return { idMatches: [], groups: [], page: 1, totalPages: 1 };
	}

	const types = FILTERS[filter] ?? TYPE_ORDER;
	const isNumeric = /^\d+$/.test(text);
	const term = COLLECTION_ALIASES[text.toLowerCase()] ?? text;

	const [idMatches, searched] = await Promise.all([
		isNumeric && page === 1 ? lookupById(client, text, types) : [],
		searchByText(client, term, types, page),
	]);

	const idKeys = new Set(idMatches.map((item) => `${item.type}:${item.id}`));
	const groups = searched.groups
		.map((group) => ({ ...group, items: group.items.filter((item) => !idKeys.has(`${item.type}:${item.id}`)) }))
		.filter((group) => group.items.length);

	return { idMatches, groups, page, totalPages: searched.totalPages };
}
