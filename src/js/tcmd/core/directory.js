// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/core/directory
// A Directory is the per-pane state: the current path, the entries read from
// the filesystem, the derived (filtered + sorted) view, the cursor, the disk
// figures and the selection buffer. A pane owns exactly one directory — the
// former multi-tab model is gone — and the pane's cells proxy it directly.

import { cell, derived, effect } from "select/state/cells"
import { viewEntries } from "./entries.js"
import { clampCursor, currentEntry, toggleMark } from "./selection.js"
import { SEP, parent as parentPath, split, prefix } from "./path.js"

// Function: enrichEntry
// Merges `stat` details (ctime, mode, uid, gid) the listing may not carry.
async function enrichEntry(fs, entry) {
	if (!entry) return null
	const stats = await fs.stat(entry.path).catch(() => null)
	if (!stats) return entry
	return {
		...entry,
		size: entry.isDir ? 0 : (stats.size ?? entry.size),
		mtimeMs: stats.mtimeMs ?? entry.mtimeMs,
		ctimeMs: stats.ctimeMs ?? entry.ctimeMs,
		mode: stats.mode ?? entry.mode,
		uid: stats.uid ?? entry.uid,
		gid: stats.gid ?? entry.gid,
	}
}

// Function: createDirectory
// Creates the directory state for one pane, bound to a filesystem adapter.
//
// Example:
// ```javascript
// const dir = createDirectory({ fs: createNodeFs(), path: "/home" })
// await dir.refresh()
// dir.entries.value // sorted, filtered FileEntry[]
// ```
function createDirectory({ fs, path: initialPath }) {
	const dir = { fs }
	dir.path = cell(initialPath)
	dir.rawEntries = cell([])
	dir.loading = cell(false)
	dir.error = cell(null)
	dir.filter = cell("")
	dir.sort = cell({ key: "name", dir: 1 })
	dir.entries = derived([dir.rawEntries, dir.filter, dir.sort], ([raw, filter, sort]) =>
		viewEntries(raw, filter, sort),
	)
	dir.cursor = cell(0)
	dir.disk = cell(null)
	// Stat details (ctime, mode, uid, gid) for the entry under the cursor,
	// fetched lazily: listings only carry size/mtime, so the pane detail line
	// re-stats the selected path when the cursor moves (cached by path).
	dir.cursorStat = cell(null)
	let cursorStatPath = null
	// Selection buffer for this directory (the pane's marked paths).
	dir.marked = cell(new Set())

	// A changing filter re-ranks the listing: snap the cursor back to the top
	// match. Disposed with the directory (see `dispose`).
	const stopFilterWatch = effect([dir.filter], () => dir.cursor.set(0))

	// Re-stat the cursor entry on movement; cache by path so a re-render that
	// does not move the cursor does not hit the filesystem again.
	const stopCursorWatch = effect([dir.entries, dir.cursor], () => {
		const entry = currentEntry(dir.entries.value, dir.cursor.value)
		if (!entry || entry.path === cursorStatPath) return
		cursorStatPath = entry.path
		dir.cursorStat.set(entry)
		void enrichEntry(fs, entry).then((enriched) => {
			if (cursorStatPath === entry.path) dir.cursorStat.set(enriched)
		})
	})

	// Function: refresh
	// Re-reads the directory at `dir.path`, updating `rawEntries` and clamping
	// the cursor. Sets `loading` while in flight; failures land in `error`.
	dir.refresh = async () => {
		dir.loading.set(true)
		dir.error.set(null)
		try {
			dir.rawEntries.set(await fs.readDir(dir.path.value))
			dir.cursor.set(clampCursor(dir.cursor.value, dir.entries.value.length))
			dir.disk.set(await fs.disk(dir.path.value))
		} catch (error) {
			dir.error.set(`${error?.message ?? error}`)
		} finally {
			dir.loading.set(false)
		}
	}

	// Function: navigate
	// Moves the directory to `path` (resetting filter, marks and cursor) and
	// refreshes.
	dir.navigate = async (path) => {
		dir.path.set(path)
		dir.filter.set("")
		dir.marked.set(new Set())
		dir.cursor.set(0)
		await dir.refresh()
	}

	// Function: up
	// Navigates to the parent directory; no-op at the filesystem root.
	dir.up = async () => {
		const target = parentPath(dir.path.value)
		if (target) await dir.navigate(target)
	}

	// Function: clearFilter
	// Removes the directory's filter, restoring the full listing.
	dir.clearFilter = () => dir.filter.set("")

	// Function: open
	// Opens the entry under the cursor: descends into directories.
	dir.open = async () => {
		const entry = currentEntry(dir.entries.value, dir.cursor.value)
		if (entry?.isDir) await dir.navigate(entry.path)
	}

	// Function: currentEntry
	// The entry under the cursor, or `undefined` for empty listings.
	dir.currentEntry = () => currentEntry(dir.entries.value, dir.cursor.value)

	// Function: toggleMark
	// Marks or unmarks the entry under the cursor.
	dir.toggleMark = () => {
		const entry = dir.currentEntry()
		if (entry) dir.marked.set(toggleMark(dir.marked.value, entry.path))
	}

	// Function: segments
	// Derived breadcrumb steps for the current path: [{ name, path }], starting
	// with the filesystem root.
	dir.segments = derived([dir.path], ([p]) => {
		const parts = split(p)
		const steps = parts.map((name, i) => ({ name, path: prefix(p, i + 1) }))
		return [{ name: SEP, path: SEP }, ...steps]
	})

	// Function: dispose
	// Releases the directory's reactive watchers.
	dir.dispose = () => {
		stopFilterWatch()
		stopCursorWatch()
	}

	return dir
}

export { createDirectory }
