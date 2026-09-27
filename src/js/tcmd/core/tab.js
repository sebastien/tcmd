// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/core/tab
// A Tab is the per-directory state of a pane: current path, the entries read
// from the filesystem, the derived (filtered + sorted) view, the cursor, the
// disk figures and the selection buffer the tab contributes to the session
// filesets. Tabs belong to a pane, which owns the shared marks map and the
// label allocator; the active tab's state is what the pane proxies.

import { cell, derived, effect } from "select/state/cells"
import { viewEntries } from "./entries.js"
import { clampCursor, currentEntry, toggleMark } from "./selection.js"
import { SEP, parent as parentPath, split, prefix } from "./path.js"

let TAB_SEQ = 0

// Function: createTab
// Creates tab state bound to a filesystem adapter and a pane-level marks cell
// (a `{ [tabId]: Set<path> }` map), so selections across tabs stay reactive.
//
// Example:
// ```javascript
// const marks = cell({})
// const tab = createTab({ fs: createNodeFs(), path: "/home", label: "A", marks })
// await tab.refresh()
// tab.marked.value // Set of marked paths for this tab
// ```
function createTab({ fs, path: initialPath, label = "A", marks = cell({}) }) {
	const tab = { id: `tab-${++TAB_SEQ}`, label, fs }
	tab.path = cell(initialPath)
	tab.rawEntries = cell([])
	tab.loading = cell(false)
	tab.error = cell(null)
	tab.filter = cell("")
	tab.sort = cell({ key: "name", dir: 1 })
	tab.entries = derived([tab.rawEntries, tab.filter, tab.sort], ([raw, filter, sort]) =>
		viewEntries(raw, filter, sort),
	)
	tab.cursor = cell(0)
	tab.disk = cell(null)
	// Selection buffer: a reactive view into the pane's marks map, so every
	// tab's marks can be observed from one cell (the session filesets).
	tab.marked = marks.select(tab.id, new Set())

	// A changing filter re-ranks the listing: snap the cursor back to the top
	// match. Disposed with the tab (see `dispose`).
	const stopFilterWatch = effect([tab.filter], () => tab.cursor.set(0))

	// Function: refresh
	// Re-reads the directory at `tab.path`, updating `rawEntries` and clamping
	// the cursor. Sets `loading` while in flight; failures land in `error`.
	tab.refresh = async () => {
		tab.loading.set(true)
		tab.error.set(null)
		try {
			tab.rawEntries.set(await fs.readDir(tab.path.value))
			tab.cursor.set(clampCursor(tab.cursor.value, tab.entries.value.length))
			tab.disk.set(await fs.disk(tab.path.value))
		} catch (error) {
			tab.error.set(`${error?.message ?? error}`)
		} finally {
			tab.loading.set(false)
		}
	}

	// Function: navigate
	// Moves the tab to `path` (resetting filter, marks and cursor) and refreshes.
	tab.navigate = async (path) => {
		tab.path.set(path)
		tab.filter.set("")
		tab.marked.set(new Set())
		tab.cursor.set(0)
		await tab.refresh()
	}

	// Function: up
	// Navigates to the parent directory; no-op at the filesystem root.
	tab.up = async () => {
		const target = parentPath(tab.path.value)
		if (target) await tab.navigate(target)
	}

	// Function: clearFilter
	// Removes the tab's filter, restoring the full listing.
	tab.clearFilter = () => tab.filter.set("")

	// Function: open
	// Opens the entry under the cursor: descends into directories.
	tab.open = async () => {
		const entry = currentEntry(tab.entries.value, tab.cursor.value)
		if (entry?.isDir) await tab.navigate(entry.path)
	}

	// Function: currentEntry
	// The entry under the cursor, or `undefined` for empty listings.
	tab.currentEntry = () => currentEntry(tab.entries.value, tab.cursor.value)

	// Function: toggleMark
	// Marks or unmarks the entry under the cursor in this tab's buffer.
	tab.toggleMark = () => {
		const entry = tab.currentEntry()
		if (entry) tab.marked.set(toggleMark(tab.marked.value, entry.path))
	}

	// Function: segments
	// Derived breadcrumb steps for the current path: [{ name, path }], starting
	// with the filesystem root.
	tab.segments = derived([tab.path], ([p]) => {
		const parts = split(p)
		const steps = parts.map((name, i) => ({ name, path: prefix(p, i + 1) }))
		return [{ name: SEP, path: SEP }, ...steps]
	})

	// Function: dispose
	// Releases the tab's reactive watchers; the pane calls it on close.
	tab.dispose = () => stopFilterWatch()

	return tab
}

// Function: createLabels
// Allocates stable fileset labels (A, B, …, Z, A1, B1, …). Closing a tab
// releases its label so the next new tab can reuse it.
function createLabels() {
	const used = new Set()
	return {
		acquire() {
			for (let round = 0; ; round++) {
				const suffix = round === 0 ? "" : `${round}`
				for (let i = 0; i < 26; i++) {
					const label = `${String.fromCharCode(65 + i)}${suffix}`
					if (!used.has(label)) {
						used.add(label)
						return label
					}
				}
			}
		},
		release(label) {
			used.delete(label)
		},
	}
}

export { createLabels, createTab }
