// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/core/directory
// A Directory is the per-pane state: the current path, the entries read from
// the filesystem, the derived (filtered + sorted) view, the cursor, the disk
// figures, the selection buffer and the navigation history (back/forward).
// A pane owns exactly one directory — the
// former multi-tab model is gone — and the pane's cells proxy it directly.
//
// Reads commit atomically: the displayed directory (path, listing, filter,
// marks, cursor) is replaced in one reactive batch once its replacement is
// ready, and only the latest read may publish (see `read`). Listings carry
// their stat details, so the cursor entry needs no separate enrichment pass.

import { batch, cell, derived } from "select/state/cells"
import { viewEntries } from "./entries.js"
import { createHistory } from "./history.js"
import { clampCursor, currentEntry, indexOfPath, toggleMark } from "./selection.js"
import { SEP, parent as parentPath, split, prefix } from "./path.js"
import { createPathWatcher } from "./watch.js"

// Function: createDirectory
// Creates the directory state for one pane, bound to a filesystem adapter.
//
// Options:
// - `watch`: true (default) auto-refreshes when the displayed directory
//   changes; false disables it; an object forwards `{ delay, interval }` to
//   `core/watch` (tests use a short delay).
// - `vcs`: an optional VCS adapter (see `core/vcs`); its per-directory status
//   is attached to the listing in the background.
//
// Example:
// ```javascript
// const dir = createDirectory({ fs: createNodeFs(), path: "/home" })
// await dir.refresh()
// dir.entries.value // sorted, filtered FileEntry[]
// ```
function createDirectory({ fs, path: initialPath, context: initialContext, watch = true, vcs = null }) {
	const dir = { fs }
	dir.path = cell(initialPath)
	dir.rawEntries = cell([])
	dir.loading = cell(false)
	dir.error = cell(null)
	dir.filter = cell("")
	dir.sort = cell({ key: "name", dir: 1 })
	// The detected repository of the displayed directory (`{ root, kind }`),
	// or null outside one; the identity bar names it.
	dir.repo = cell(null)
	// Per-entry VCS status, keyed by absolute path and filled asynchronously
	// by the adapter (see `read`).
	dir.vcsStatus = cell(new Map())
	dir.entries = derived([dir.rawEntries, dir.filter, dir.sort, dir.vcsStatus], ([raw, filter, sort, statuses]) =>
		viewEntries(withVcsStatus(raw, statuses), filter, sort),
	)
	dir.cursor = cell(0)
	dir.disk = cell(null)
	// Selection buffer for this directory (the pane's marked paths).
	dir.marked = cell(new Set())
	// An opaque per-entry value the owner captures into the history and gets
	// back on restore. The session uses it to restore the focused column; the
	// directory itself never inspects it.
	let context = initialContext
	const contextGet = () => context?.get?.()
	const contextSet = (value) => context?.set?.(value)
	// Function: snapshot
	// The directory's restorable view state: path, filter, cursor, marks and
	// the owner's context.
	const snapshot = () => ({
		path: dir.path.value,
		filter: dir.filter.value,
		cursor: dir.cursor.value,
		marks: new Set(dir.marked.value),
		context: contextGet(),
	})
	// Navigation history: full view snapshots with the current one at
	// `history.index`, so back/forward restore position, selection and filter
	// like a browser.
	dir.history = createHistory(snapshot())
	// Cursor memory: the last cursor position per path, so re-entering a
	// directory (a fresh `open`, not a history step) lands on the entry that
	// was last selected there.
	const cursorMemory = new Map()
	let readToken = 0
	// Auto-refresh: one watcher on the displayed path. It is re-armed after a
	// move commits and released on dispose. A change notification during a
	// *move* is ignored — the read in flight is already producing the next
	// listing, and refreshing the path being left would race its token. During
	// a plain refresh a notification may supersede it: the newer read carries
	// the newest change, so no event is ever lost to a slow listing.
	const watchOptions = watch === false ? null : watch === true || watch == null ? {} : watch
	// Whether this directory currently watches its path. The session pauses
	// columns the view does not show, so a hidden pane does not keep polling
	// the filesystem (or hold a desktop RPC watcher) for nothing.
	dir.autoRefresh = cell(Boolean(watchOptions))
	let watchedPath = null
	let stopWatcher = null
	let moving = false
	const stopWatching = () => {
		stopWatcher?.()
		stopWatcher = null
		watchedPath = null
	}
	const watchCurrentPath = () => {
		if (!watchOptions || !dir.autoRefresh.value || watchedPath === dir.path.value) return
		stopWatching()
		const path = dir.path.value
		watchedPath = path
		stopWatcher = createPathWatcher(
			fs,
			path,
			() => {
				if (moving || watchedPath !== dir.path.value) return
				void dir.refresh()
			},
			watchOptions,
		)
	}

	// Function: setContext
	// Replaces the owner context captured into history entries.
	dir.setContext = (next) => {
		context = next
	}

	// Function: read
	// Reads `path` and, unless a newer read supersedes it, commits the listing
	// as one atomic update: the displayed directory stays intact until its
	// replacement is ready, and disk figures never delay the listing.
	//
	// Options:
	// - `move`: move to `path` (reset filter and marks, remember the cursor
	//   for re-entry). Without it, `read` re-reads the displayed directory in
	//   place, preserving filter, marks and cursor (`refresh`).
	// - `record`: also record the move in the history (a navigation). Mirror
	//   columns move without recording.
	// - `cursorPath`: land the cursor on that entry when the listing has it.
	// - `restore`: a history snapshot to restore instead of a fresh move.
	const read = async (
		path,
		{ move = false, record = false, cursorPath = null, restore = null } = {},
	) => {
		const token = ++readToken
		const isMove = move || Boolean(restore)
		// A refresh keeps the same entry selected when entries are inserted or
		// removed above it; the raw cursor index alone would drift, which
		// matters once refreshes happen behind the user's back.
		const keepPath = !isMove ? (dir.currentEntry()?.path ?? null) : null
		if (isMove) moving = true
		batch(() => {
			dir.loading.set(true)
			dir.error.set(null)
		})
		try {
			const raw = await fs.readDir(path)
			if (token !== readToken) return
			const filter = restore ? restore.filter : isMove ? "" : dir.filter.value
			const entries = viewEntries(raw, filter, dir.sort.value)
			let cursor
			if (restore) {
				cursor = clampCursor(restore.cursor, entries.length)
			} else {
				const remembered = isMove && path !== dir.path.value
					? (cursorMemory.get(path) ?? 0)
					: dir.cursor.value
				const kept = keepPath ? indexOfPath(entries, keepPath) : -1
				const selected = cursorPath ? indexOfPath(entries, cursorPath) : -1
				cursor = clampCursor(kept >= 0 ? kept : selected >= 0 ? selected : remembered, entries.length)
			}
			// A move that rewrites the filter sets the cursor it computed; no
			// watcher intervenes (the filter cell is written directly, not
			// through `setFilter`).
			batch(() => {
				if (restore) {
					dir.path.set(path)
					dir.filter.set(restore.filter)
					dir.marked.set(new Set(restore.marks))
					dir.disk.set(null)
					contextSet(restore.context)
				} else if (isMove) {
					cursorMemory.set(dir.path.value, dir.cursor.value)
					// Capture the view being left before overwriting it, but
					// only for recorded moves: mirror columns keep no history.
					if (record) dir.history.replace(snapshot())
					dir.path.set(path)
					dir.filter.set("")
					dir.marked.set(new Set())
					dir.disk.set(null)
				}
				// A move leaves the previous repository behind; the new status
				// arrives asynchronously below. A same-path refresh keeps the
				// current status until the replacement lands.
				if (isMove) {
					dir.repo.set(null)
					dir.vcsStatus.set(new Map())
				}
				dir.rawEntries.set(raw)
				dir.cursor.set(cursor)
				dir.loading.set(false)
			})
			// VCS status is supplementary: the listing is already visible, and
			// the letters arrive when the (cached) status command returns. A
			// later navigation invalidates the result through the read token.
			if (vcs) {
				void vcs.statusFor(path, raw).then(
					(info) => {
						if (token !== readToken) return
						batch(() => {
							dir.repo.set(info ? { root: info.root, kind: info.kind } : null)
							dir.vcsStatus.set(info?.statuses ?? new Map())
						})
					},
					() => {},
				)
			}
			watchCurrentPath()
			if (record) {
				const entry = { path, filter: "", cursor, marks: new Set(), context: contextGet() }
				// Re-navigating to the current path updates the entry instead of
				// duplicating it.
				if (dir.history.current()?.path === path) dir.history.replace(entry)
				else dir.history.push(entry)
			}
			const disk = await fs.disk(path)
			if (token === readToken) dir.disk.set(disk)
		} catch (error) {
			if (token === readToken) dir.error.set(`${error?.message ?? error}`)
		} finally {
			if (token === readToken) {
				moving = false
				dir.loading.set(false)
			}
		}
	}

	// Function: refresh
	// Re-reads the displayed directory, preserving filter, marks and cursor.
	dir.refresh = () => read(dir.path.value)

	// Function: setAutoRefresh
	// Pauses or resumes the path watcher. Resuming re-reads the listing: it
	// may have changed while the column was hidden and unwatched. A no-op for
	// a directory created with `watch: false`, and while a move is in flight
	// (that read already produces the next listing and re-arms the watcher).
	dir.setAutoRefresh = (enabled) => {
		if (!watchOptions) return
		const next = enabled !== false
		if (dir.autoRefresh.value === next) return
		dir.autoRefresh.set(next)
		if (!next) {
			stopWatching()
			return
		}
		if (!moving) {
			watchCurrentPath()
			void dir.refresh()
		}
	}

	// Function: navigate
	// Moves the directory to `path` (resetting filter and marks, restoring the
	// cursor remembered for `path`), records the step in the history and reads
	// the listing. Re-navigating to the current path does not duplicate the
	// entry. `record: false` mirrors without touching the history (the
	// explorer's parent and inspector columns).
	dir.navigate = (path, { cursorPath = null, record = true } = {}) =>
		read(path, { move: true, record, cursorPath })

	// Function: back
	// Restores the previous history entry — path, filter, cursor and marks —
	// and reads it; no-op at the start of the history.
	dir.back = async () => {
		const entry = dir.history.back()
		if (entry) await read(entry.path, { restore: entry })
	}

	// Function: forward
	// Restores the next history entry; no-op at the end of the history.
	dir.forward = async () => {
		const entry = dir.history.forward()
		if (entry) await read(entry.path, { restore: entry })
	}

	// Function: up
	// Navigates to the parent directory, landing the cursor on the entry we
	// came from — stepping up always returns to the previously selected
	// element. No-op at the filesystem root.
	dir.up = async () => {
		const cameFrom = dir.path.value
		const target = parentPath(cameFrom)
		if (!target) return
		await dir.navigate(target, { cursorPath: cameFrom })
	}

	// Function: setFilter
	// Sets the fuzzy filter and re-anchors the cursor on the first match.
	dir.setFilter = (query) => {
		dir.filter.set(query)
		dir.cursor.set(0)
	}

	// Function: clearFilter
	// Removes the directory's filter, restoring the full listing.
	dir.clearFilter = () => dir.setFilter("")

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
	// Cancels any in-flight read so a late listing can no longer publish, and
	// releases the path watcher.
	dir.dispose = () => {
		readToken += 1
		stopWatching()
	}

	// Start watching the opening directory; a later move re-arms the watcher
	// on its target (see `read`).
	watchCurrentPath()

	return dir
}

// Function: withVcsStatus
// A copy of `entries` carrying the VCS status from `statuses` as
// `entry.vcsStatus`. Raw listing objects are never mutated, so a status
// refresh can recompute the view without re-reading the directory.
function withVcsStatus(entries, statuses) {
	if (!statuses?.size) return entries
	return entries.map((entry) => {
		const status = statuses.get(entry.path) ?? null
		return status === entry.vcsStatus ? entry : { ...entry, vcsStatus: status }
	})
}

export { createDirectory }
