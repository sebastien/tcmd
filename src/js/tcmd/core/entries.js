// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/entries
// Pure operations over file entries: filtering and sorting. Directories sort
// first, then by the configured key. Entries are plain objects shaped by the
// filesystem adapter (see core/fs).

// Function: filterEntries
// Keeps entries whose name contains `query` (case-insensitive). An empty
// query keeps everything.
function filterEntries(entries, query) {
	const q = `${query ?? ""}`.trim().toLowerCase()
	if (!q) return entries
	const res = []
	for (let i = 0; i < entries.length; i++) {
		if (entries[i].name.toLowerCase().includes(q)) res.push(entries[i])
	}
	return res
}

// Function: sortEntries
// Sorts a copy of `entries`: directories first, then by `sort.key`
// ("name" | "size" | "mtime") in `sort.dir` (1 ascending, -1 descending).
function sortEntries(entries, sort) {
	const key = sort?.key ?? "name"
	const dir = sort?.dir ?? 1
	const sorted = entries.slice()
	sorted.sort((a, b) => {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
		let cmp = 0
		if (key === "name") cmp = a.name.localeCompare(b.name)
		else if (key === "size") cmp = a.size - b.size
		else if (key === "mtime") cmp = a.mtimeMs - b.mtimeMs
		return cmp * dir
	})
	return sorted
}

export { filterEntries, sortEntries }

// EOF
