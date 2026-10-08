// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/FileRow
// File listing row behaviors. Read `{ item: entry, index, cursor, marked,
// paneId }`, the same bag shape in both engines. `cursor` and `marked` are
// reactive cells, read with `unwrap` at the point of use.
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
function rowMarker(entry, index, cursor, marked) {
	if (isMarked(entry, marked)) return "* "
	return isCurrent(index, cursor) ? "> " : "  "
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
			if (isCurrent(data.index, unwrap(data.cursor))) {
				// The active pane's cursor is the strong accent; the inactive
				// pane keeps a muted cursor so focus is visible from the row
				// alone. A missing `active` (web, single-pane hosts) reads as
				// active.
				return unwrap(data.active) === false ? env.cursorInactiveBg : env.cursorBg
			}
			if (isMarked(data.item, unwrap(data.marked))) return env.accentSecondaryBg
			return undefined
		},
		rowClass: (_self, data) =>
			isCurrent(data.index, unwrap(data.cursor)) ? env.currentClass : null,
		rowMarker: (_self, data) =>
			rowMarker(data.item, data.index, unwrap(data.cursor), unwrap(data.marked)),
		rowMarkerFg: (_self, data) =>
			isMarked(data.item, unwrap(data.marked)) ? env.accentSecondaryFg : env.accentFg,
		rowName: (_self, data) => rowName(data.item),
		rowNameClass: (_self, data) => (data.item?.isDir ? env.dirClass : null),
		rowNameFg: (_self, data) => nameFg(data.item, env),
		rowSize: (_self, data) => rowSize(data.item),
		rowSizeFg: () => env.textSecondaryFg,
	}
}

export { createBehaviors, isMarked, nameFg, rowMarker, rowName, rowSize }

// EOF
