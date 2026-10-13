// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/pane
// A Pane is one column with a single directory: it owns that directory and
// proxies its cells (path, entries, cursor, marks, disk, …) as pane-level
// cells, so views and commands address the pane directly. Navigation reads the
// target first and commits atomically (see `core/directory#read`), so the pane
// keeps showing its current listing until the replacement is ready. The pane
// also owns its navigation history (back/forward snapshots of the view), which
// the session drives to restore position, selection and focus.

import { cell } from "select/state/cells"
import { createDirectory } from "./directory.js"

// Constant: PANE_BUFFERS
// The selection-buffer label per pane: the left (source) pane is `$A`, the
// right (destination) pane is `$B`, so scripting keeps two named buffers.
const PANE_BUFFERS = { left: "A", right: "B" }

// Constant: PANE_LABELS
// The pane role labels: the left pane is the source (SRC), the right the
// destination (DST).
const PANE_LABELS = { left: "SRC", right: "DST" }

// Function: currentPaneId
// The id of the pane that owns the current directory: the focused pane while
// focus is on source/destination, the anchor pane otherwise.
function currentPaneId(session) {
	return session.currentId?.value ?? session.active?.value ?? "left"
}

// Function: currentPane
// The pane that owns the current directory: the focused pane while focus is
// on source/destination, the anchor pane while it is on an auxiliary column
// (see `core/session`). Path-changing commands — open, up, history,
// breadcrumbs, relative arguments — target it; only cursor movement follows
// the focused column. `core/commands` keeps `pane()` for the latter.
function currentPane(session) {
	return session.panes[currentPaneId(session)] ?? session.panes.left
}

// Function: createPane
// Creates a pane bound to a filesystem adapter at `path`.
//
// Example:
// ```javascript
// const pane = createPane({ fs: createNodeFs(), path: "/home" })
// await pane.refresh()
// pane.entries.value // sorted, filtered FileEntry[]
// ```
function createPane({ fs, path: initialPath, context } = {}) {
	const pane = {}
	pane.fs = fs
	pane.directory = createDirectory({ fs, path: initialPath, context })

	// Proxy cells mirror the directory, so views address the pane uniformly.
	const dir = pane.directory
	pane.path = dir.path
	pane.rawEntries = dir.rawEntries
	pane.loading = dir.loading
	pane.error = dir.error
	pane.filter = dir.filter
	pane.sort = dir.sort
	pane.entries = dir.entries
	pane.cursor = dir.cursor
	pane.marked = dir.marked
	pane.disk = dir.disk
	pane.segments = dir.segments
	pane.history = dir.history

	// Function: current
	// The pane's directory.
	pane.current = () => pane.directory

	// Function: refresh / navigate / up / open / back / forward /
	// currentEntry / toggleMark / setFilter / clearFilter — delegate to the
	// directory.
	pane.refresh = () => pane.directory.refresh()
	pane.navigate = (path, options) => pane.directory.navigate(path, options)
	pane.up = () => pane.directory.up()
	pane.open = () => pane.directory.open()
	pane.back = () => pane.directory.back()
	pane.forward = () => pane.directory.forward()
	pane.currentEntry = () => pane.directory.currentEntry()
	pane.toggleMark = () => pane.directory.toggleMark()
	pane.setFilter = (query) => pane.directory.setFilter(query)
	pane.clearFilter = () => pane.directory.clearFilter()
	pane.setContext = (context) => pane.directory.setContext(context)
	pane.dispose = () => pane.directory.dispose()

	return pane
}

export { PANE_BUFFERS, PANE_LABELS, createPane, currentPane, currentPaneId }
