// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/FileRow
// File listing row behaviors. Read `{ item: entry, index, cursor, marked,
// paneId }`, the same bag shape in both engines.
//
// Environment: `cursorBg`, `currentClass`, `markFg`, `accentFg`, `dirFg`,
// `textFg`, `dimFg`, `dirClass`.

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

// Function: createBehaviors
// Builds the FileRow behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		rowBg: (_self, data) => (isCurrent(data.index, data.cursor) ? env.cursorBg : undefined),
		rowClass: (_self, data) => (isCurrent(data.index, data.cursor) ? env.currentClass : null),
		rowMarker: (_self, data) => rowMarker(data.item, data.index, data.cursor, data.marked),
		rowMarkerFg: (_self, data) =>
			isMarked(data.item, data.marked) ? env.markFg : env.accentFg,
		rowName: (_self, data) => rowName(data.item),
		rowNameClass: (_self, data) => (data.item?.isDir ? env.dirClass : null),
		rowNameFg: (_self, data) => (data.item?.isDir ? env.dirFg : env.textFg),
		rowSize: (_self, data) => rowSize(data.item),
		rowSizeFg: () => env.dimFg,
	}
}

export { createBehaviors, isCurrent, isMarked, rowMarker, rowName, rowSize }
