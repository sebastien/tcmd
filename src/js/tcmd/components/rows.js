// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/rows
// Keyed row builders shared by the TUI and web catalogues. Each builder turns a
// parent's data bag into the `{ item, index, … }` bag its row components
// receive, so the bag shape is defined once and both renderers stay in sync.
//
// Data fields are reactive cells, so they are resolved with `read()` before
// mapping; `Component.map` receives plain collections on both backends.

import { read } from "./read.js"

// Function: breadcrumbRows
// `{ item: segment, index, paneId }` bags for `Crumb` rows.
function breadcrumbRows(Crumb) {
	return (data) =>
		Crumb.map(
			read(data.segments) ?? [],
			(item, index) => ({ item, index, paneId: read(data.paneId) }),
			(segment) => segment.path,
		)
}

// Function: fileRows
// `{ item: entry, index, cursor, marked, paneId }` bags for `FileRow` rows.
function fileRows(FileRow) {
	return (data) =>
		FileRow.map(
			read(data.entries) ?? [],
			(item, index) => ({
				item,
				index,
				cursor: read(data.cursor),
				marked: read(data.marked),
				paneId: read(data.paneId),
			}),
			(entry) => entry.path,
		)
}

// Function: paletteRows
// `{ item: command, index, selected }` bags for `PaletteRow` rows.
function paletteRows(PaletteRow) {
	return (data) =>
		PaletteRow.map(
			read(data.items) ?? [],
			(item, index) => ({ item, index, selected: read(data.selected) }),
			(command) => command.id,
		)
}

// Function: toolRows
// `{ item: command, index }` bags for `ToolItem` rows.
function toolRows(ToolItem) {
	return (data) =>
		ToolItem.map(
			read(data.commands) ?? [],
			(item, index) => ({ item, index }),
			(command) => command.id,
		)
}

export { breadcrumbRows, fileRows, paletteRows, toolRows }
