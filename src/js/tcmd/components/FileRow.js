// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/FileRow
// File listing row behaviors. Read `{ item: entry, index, currentRow,
// markedRow, active, paneId }`, the same bag shape in both engines.
// `currentRow`/`markedRow` are plain per-row booleans snapshotted by the
// `fileRows` builder (see `rows.js`); `active` is the pane-focus cell, read
// with `unwrap` at the point of use.
//
// Environment: `cursorBg`, `cursorInactiveBg`, `currentClass`,
// `accentSecondaryFg`, `accentFg`, `linkFg`, `dirFg`, `devFg`, `fileFg`,
// `textSecondaryFg`, `dirClass`.

import { unwrap } from "select/state/cells"
import { formatSize } from "./format.js"

// Function: rowName
function rowName(entry) {
	if (!entry) return ""
	return entry.isDir ? `${entry.name}/` : entry.name
}

// Function: rowSize
function rowSize(entry) {
	if (!entry) return ""
	return entry.isDir ? "<dir>" : formatSize(entry.size)
}

// Function: isCurrent
function isCurrent(index, cursor) {
	return index === cursor
}

// Function: isMarked
function isMarked(entry, marked) {
	return Boolean(entry && marked?.has?.(entry.path))
}

// Function: rowMarker
// The 2-char row marker: "*" for a marked row, ">" for the cursor row — marks
// win, so a marked-and-current row still reads as marked.
function rowMarker(data) {
	return rowIsMarked(data) ? "* " : rowCurrent(data) ? "> " : "  "
}

// Function: rowCurrent
// Whether the row is the pane cursor. The plain `currentRow` flag (snapshotted
// by the row builder) wins; otherwise fall back to comparing the row index
// against the shared cursor cell. Because the flag is plain, a cursor move
// rewrites only the two changed row bags instead of re-rendering every row.
function rowCurrent(data) {
	if (data.currentRow !== undefined) return data.currentRow === true
	return isCurrent(data.index, unwrap(data.cursor))
}

// Function: rowIsMarked
// Whether the row's entry is marked. `bag.markedRow` (a plain per-row boolean)
// wins; otherwise compare against the shared marked set.
function rowIsMarked(data) {
	if (data.markedRow !== undefined) return data.markedRow === true
	return isMarked(data.item, unwrap(data.marked))
}

// Function: nameFg
// The listing color for an entry: a symlink reads as a link, a directory as a
// directory, a device node as a device, otherwise the plain file color.
// Symlinks win over directories, matching `dircolors` (a link to a directory
// renders as a link).
function nameFg(item, env) {
	if (item?.isSymlink) return env.linkFg
	if (item?.isDir) return env.dirFg
	if (item?.isDevice) return env.devFg
	return env.fileFg
}

// Function: createBehaviors
// Builds the FileRow behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		rowBg: (_self, data) => {
			if (rowCurrent(data)) {
				// The active pane's cursor is the strong accent; the inactive
				// pane keeps a muted cursor so focus is visible from the row
				// alone. A missing `active` (web, single-pane hosts) reads as
				// active.
				return unwrap(data.active) === false ? env.cursorInactiveBg : env.cursorBg
			}
			if (rowIsMarked(data)) return env.accentSecondaryBg
			return undefined
		},
		rowClass: (_self, data) => (rowCurrent(data) ? env.currentClass : null),
		rowMarker: (_self, data) => rowMarker(data),
		rowMarkerFg: (_self, data) => (rowIsMarked(data) ? env.accentSecondaryFg : env.accentFg),
		rowName: (_self, data) => rowName(data.item),
		rowNameClass: (_self, data) => (data.item?.isDir ? env.dirClass : null),
		rowNameFg: (_self, data) => nameFg(data.item, env),
		rowSize: (_self, data) => rowSize(data.item),
		rowSizeFg: () => env.textSecondaryFg,
	}
}

export { createBehaviors, isMarked, nameFg, rowName, rowSize }

// EOF
