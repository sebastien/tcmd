// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/entries
// Pure operations over file entries: fuzzy filtering and sorting. Entries are
// plain objects shaped by the filesystem adapter (see core/fs). Matching uses
// the vendored fzy scorer (see vendor/fzy): a query matches when its characters
// appear in order, and matches are ranked by score. Directories stay grouped
// first, then by the configured sort key when scores tie.

import { hasMatch, score } from "../vendor/fzy.js"

// Function: normalizeQuery
// Trims the raw filter text; an empty/whitespace query means "no filter".
function normalizeQuery(query) {
	return `${query ?? ""}`.trim()
}

// Function: filterEntries
// Keeps entries whose name fuzzily matches `query` (subsequence,
// case-insensitive), in listing order. An empty query keeps everything.
function filterEntries(entries, query) {
	const q = normalizeQuery(query)
	if (!q) return entries
	const res = []
	for (let i = 0; i < entries.length; i++) {
		if (hasMatch(q, entries[i].name)) res.push(entries[i])
	}
	return res
}

// Function: compareEntries
// Orders two entries within the same group (dir/file) by `sort.key`
// ("name" | "size" | "mtime") and `sort.dir` (1 ascending, -1 descending).
function compareEntries(a, b, sort) {
	const key = sort?.key ?? "name"
	const dir = sort?.dir ?? 1
	let cmp = 0
	if (key === "name") cmp = a.name.localeCompare(b.name)
	else if (key === "size") cmp = (a.size ?? 0) - (b.size ?? 0)
	else if (key === "mtime") cmp = (a.mtimeMs ?? 0) - (b.mtimeMs ?? 0)
	return cmp * dir
}

// Function: rankEntries
// Fuzzily matches `entries` against `query` and ranks them: directories first,
// then by descending fzy score, ties broken by `sort`. Entries that do not
// match are dropped.
function rankEntries(entries, query, sort) {
	const q = normalizeQuery(query)
	const ranked = []
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i]
		if (!hasMatch(q, entry.name)) continue
		ranked.push({ entry, score: score(q, entry.name) })
	}
	ranked.sort((a, b) => {
		if (a.entry.isDir !== b.entry.isDir) return a.entry.isDir ? -1 : 1
		if (a.score !== b.score) return b.score - a.score
		return compareEntries(a.entry, b.entry, sort)
	})
	return ranked.map((match) => match.entry)
}

// Function: sortEntries
// Sorts a copy of `entries`: directories first, then by `sort.key`.
function sortEntries(entries, sort) {
	const sorted = entries.slice()
	sorted.sort((a, b) => {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
		return compareEntries(a, b, sort)
	})
	return sorted
}

// Function: viewEntries
// The listing a directory shows: `sortEntries` when there is no filter,
// otherwise the fzy-ranked matches of `query` (see `rankEntries`).
function viewEntries(entries, query, sort) {
	if (!normalizeQuery(query)) return sortEntries(entries, sort)
	return rankEntries(entries, query, sort)
}

export { filterEntries, rankEntries, sortEntries, viewEntries }

// EOF
