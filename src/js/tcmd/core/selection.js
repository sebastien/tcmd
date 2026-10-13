// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/selection
// Cursor and mark arithmetic over an entry list. Pure functions: callers own
// the cells, these only compute next values.

// Function: clampCursor
// Keeps `cursor` within `0..max` where `max = length - 1`; empty lists yield 0.
function clampCursor(cursor, length) {
	if (!length) return 0
	return Math.max(0, Math.min(cursor, length - 1))
}

// Function: moveCursor
// Returns the cursor moved by `delta` entries, clamped to the list bounds.
function moveCursor(cursor, delta, length) {
	return clampCursor(cursor + delta, length)
}

// Function: currentEntry
// Returns the entry under `cursor`, or `undefined` for empty lists.
function currentEntry(entries, cursor) {
	return entries[cursor]
}

// Function: indexOfPath
// The index of the entry whose path is `path`, or -1. Navigations that must
// land on a known element use it: the directory `up` stepped out of, the
// current directory in a mirror's listing.
function indexOfPath(entries, path) {
	return entries.findIndex((entry) => entry.path === path)
}

// Function: toggleMark
// Returns a new Set with `path` toggled in `marks`.
function toggleMark(marks, path) {
	const next = new Set(marks)
	if (next.has(path)) {
		next.delete(path)
	} else {
		next.add(path)
	}
	return next
}

export { clampCursor, currentEntry, indexOfPath, moveCursor, toggleMark }

// EOF
