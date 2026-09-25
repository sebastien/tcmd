// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/pane
// A Pane is the model for one file browser column: current path, the entries
// read from the filesystem, and the derived (filtered + sorted) view the UI
// renders. All state is reactive cells so any presentation layer (TUI, web)
// can subscribe. Navigation is async and updates `rawEntries` in place.

import { cell, derived } from "select/state/cells"
import { filterEntries, sortEntries } from "./entries.js"
import { clampCursor, currentEntry, toggleMark } from "./selection.js"
import { parent as parentPath, split, prefix } from "./path.js"

// Function: createPane
// Creates a pane model bound to a filesystem adapter.
//
// Example:
// ```javascript
// const pane = createPane({ fs: createNodeFs(), path: "/home" })
// await pane.refresh()
// pane.entries.value // sorted, filtered FileEntry[]
// ```
function createPane({ fs, path: initialPath }) {
	const pane = {}
	pane.fs = fs
	pane.path = cell(initialPath)
	pane.rawEntries = cell([])
	pane.loading = cell(false)
	pane.error = cell(null)
	pane.filter = cell("")
	pane.sort = cell({ key: "name", dir: 1 })
	pane.entries = derived([pane.rawEntries, pane.filter, pane.sort], ([raw, filter, sort]) =>
		sortEntries(filterEntries(raw, filter), sort),
	)
	pane.cursor = cell(0)
	pane.marked = cell(new Set())
	pane.disk = cell(null)

	// Function: refresh
	// Re-reads the directory at `pane.path`, updating `rawEntries` and clamping
	// the cursor. Sets `loading` while in flight; failures land in `error`.
	pane.refresh = async () => {
		pane.loading.set(true)
		pane.error.set(null)
		try {
			pane.rawEntries.set(await fs.readDir(pane.path.value))
			pane.cursor.set(clampCursor(pane.cursor.value, pane.entries.value.length))
			pane.disk.set(await fs.disk(pane.path.value))
		} catch (error) {
			pane.error.set(`${error?.message ?? error}`)
		} finally {
			pane.loading.set(false)
		}
	}

	// Function: navigate
	// Moves the pane to `path` (resetting filter, marks and cursor) and refreshes.
	pane.navigate = async (path) => {
		pane.path.set(path)
		pane.filter.set("")
		pane.marked.set(new Set())
		pane.cursor.set(0)
		await pane.refresh()
	}

	// Function: up
	// Navigates to the parent directory; no-op at the filesystem root.
	pane.up = async () => {
		const target = parentPath(pane.path.value)
		if (target) await pane.navigate(target)
	}

	// Function: open
	// Opens the entry under the cursor: descends into directories.
	pane.open = async () => {
		const entry = currentEntry(pane.entries.value, pane.cursor.value)
		if (entry?.isDir) await pane.navigate(entry.path)
	}

	// Function: currentEntry
	// The entry under the cursor, or `undefined` for empty listings.
	pane.currentEntry = () => currentEntry(pane.entries.value, pane.cursor.value)

	// Function: toggleMark
	// Marks or unmarks the entry under the cursor.
	pane.toggleMark = () => {
		const entry = pane.currentEntry()
		if (entry) pane.marked.set(toggleMark(pane.marked.value, entry.path))
	}

	// Function: segments
	// Derived breadcrumb steps for the current path: [{ name, path }], starting
	// with the filesystem root.
	pane.segments = derived([pane.path], ([p]) => {
		const parts = split(p)
		const steps = parts.map((name, i) => ({ name, path: prefix(p, i + 1) }))
		return [{ name: SEP, path: SEP }, ...steps]
	})

	return pane
}

const SEP = "/"

export { createPane }

// EOF
