// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/core/bookmarks
// Named bookmarks: a `{ name -> { path, isDir } }` map the user records with
// `b` and jumps to with `g`. A bookmark remembers whether its path is a file
// or a directory (or `null` when only a legacy path is known), so a jump can
// open a directory but select-and-preview a file. Bookmarks are pure model
// state (a reactive cell) plus a persistence layer: a `BookmarkStore`
// interface with an in-memory default (tests, web) and a Node/JSON-file
// implementation (the TUI). The session only ever sees the store interface, so
// the browser bundle stays free of Node builtins.

import { cell } from "select/state/cells"

// Function: normalizeName
// Trims a bookmark name; empty names are rejected by the callers.
function normalizeName(name) {
	return `${name ?? ""}`.trim()
}

// Function: isValidName
// A bookmark name is a non-empty token without whitespace or separator
// punctuation that would be ambiguous in the list.
function isValidName(name) {
	const text = normalizeName(name)
	return text.length > 0 && !/[\s/]/.test(text)
}

// Function: normalizeEntry
// Coerces a stored value to `{ path, isDir }`: a plain string is a legacy
// path with an unknown kind (`isDir: null`), resolved when it is jumped to.
function normalizeEntry(value) {
	if (typeof value === "string") return { path: value, isDir: null }
	if (value && typeof value === "object" && typeof value.path === "string") {
		return { path: value.path, isDir: value.isDir === true ? true : value.isDir === false ? false : null }
	}
	return null
}

// Function: normalizeMap
// Coerces a stored `{ name -> value }` map, dropping unusable rows.
function normalizeMap(map) {
	const out = {}
	for (const [name, value] of Object.entries(map ?? {})) {
		const entry = normalizeEntry(value)
		if (entry) out[name] = entry
	}
	return out
}

// Function: createMemoryBookmarkStore
// In-memory store: bookmarks live for the process only. The default, used by
// tests and the web view (no filesystem surface for config).
function createMemoryBookmarkStore() {
	return {
		async load() {
			return {}
		},
		async save() {},
	}
}

// Function: createBookmarks
// Creates the bookmark model backed by `store` (defaults to in-memory) with
// initial `entries` (a `{ name -> path|{path,isDir} }` map). `load()` fills
// the cell from the store; `record(name, path, isDir)` sets a bookmark and
// persists; `remove(name)` deletes one; `clear()` empties the cell.
function createBookmarks({ store = createMemoryBookmarkStore(), entries = {} } = {}) {
	const bookmarks = { store }
	bookmarks.entries = cell(normalizeMap(entries))

	bookmarks.load = async () => {
		const loaded = await store.load?.()
		if (loaded && typeof loaded === "object") bookmarks.entries.set(normalizeMap(loaded))
		return bookmarks.entries.value
	}

	// Function: record
	// Sets `name -> { path, isDir }` and persists. Returns the stored name.
	bookmarks.record = async (name, path, isDir = null) => {
		const clean = normalizeName(name)
		if (!isValidName(clean)) throw new Error("bookmark needs a name")
		bookmarks.entries.set({
			...bookmarks.entries.value,
			[clean]: { path, isDir: isDir === true ? true : isDir === false ? false : null },
		})
		await store.save?.(bookmarks.entries.value)
		return clean
	}

	// Function: remove
	// Deletes a bookmark and persists. Returns true when one was removed.
	bookmarks.remove = async (name) => {
		const clean = normalizeName(name)
		if (clean in bookmarks.entries.value) {
			const next = { ...bookmarks.entries.value }
			delete next[clean]
			bookmarks.entries.set(next)
			await store.save?.(next)
			return true
		}
		return false
	}

	// Function: set
	// Replaces the whole map (e.g. a `bookmarks rm` script op), persisting.
	bookmarks.set = async (map) => {
		bookmarks.entries.set(normalizeMap(map))
		await store.save?.(bookmarks.entries.value)
	}

	// Function: find
	// The `{ name, path, isDir }` bookmark whose path matches, or null.
	bookmarks.find = (path) => {
		for (const [name, entry] of Object.entries(bookmarks.entries.value)) {
			if (entry.path === path) return { name, ...entry }
		}
		return null
	}

	// Function: findByName
	// The `{ name, path, isDir }` bookmark for a name, or null.
	bookmarks.findByName = (name) => {
		const entry = bookmarks.entries.value[normalizeName(name)]
		return entry ? { name: normalizeName(name), ...entry } : null
	}

	// Function: rows
	// List rows `{ name, path, isDir }`, sorted by name, for the jump list.
	bookmarks.rows = () =>
		Object.entries(bookmarks.entries.value)
			.map(([name, entry]) => ({ name, ...entry }))
			.sort((a, b) => a.name.localeCompare(b.name))

	return bookmarks
}

// Function: createFileBookmarkStore
// Node/JSON-file store. `readFile`/`writeFile`/`dir` are injected so the core
// carries no Node import (the TUI wires them from node:fs/promises and
// node:os). `load()` tolerates a missing or malformed file.
function createFileBookmarkStore({ file, readFile, writeFile, mkdir }) {
	return {
		async load() {
			try {
				const text = await readFile(file, "utf8")
				const parsed = JSON.parse(text)
				return parsed && typeof parsed === "object" ? parsed : {}
			} catch (error) {
				return {}
			}
		},
		async save(map) {
			try {
				await mkdir?.(file.replace(/\/[^/]*$/, ""), { recursive: true })
				await writeFile(file, `${JSON.stringify(map, null, 2)}\n`, "utf8")
			} catch (error) {
				// Persistence is best-effort; the in-memory map stays authoritative.
			}
		},
	}
}

export {
	createBookmarks,
	createFileBookmarkStore,
	createMemoryBookmarkStore,
	isValidName,
	normalizeEntry,
	normalizeMap,
	normalizeName,
}
