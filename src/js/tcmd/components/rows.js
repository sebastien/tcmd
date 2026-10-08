// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/rows
// Keyed row builders shared by the TUI and web catalogues. Each builder turns a
// parent's data bag into the `{ item, index, … }` bag its row components
// receive, so the bag shape is defined once and both renderers stay in sync.
//
// Values stay reactive: `Component.map` accepts cell collections directly, and
// scalar fields (cursor, marked, selected) are passed through as cells and read
// by the row behaviors with `unwrap` at the point of use, matching the
// select.js/select.tui data contract.

// Function: crumbRows
// `{ item: segment, index, paneId }` bags for `Crumb` rows.
function crumbRows(Crumb) {
	return (data) =>
		Crumb.map(
			data.segments ?? [],
			(item, index) => ({ item, index, paneId: data.paneId }),
			(segment) => segment.path,
		)
}

// Function: fileRows
// `{ item: entry, index, cursor, marked, active, paneId }` bags for `FileRow`
// rows. `active` is the pane-focus flag so the cursor row can render muted in
// the inactive pane.
function fileRows(FileRow) {
	return (data) =>
		FileRow.map(
			data.entries ?? [],
			(item, index) => ({
				item,
				index,
				cursor: data.cursor,
				marked: data.marked,
				active: data.active,
				paneId: data.paneId,
			}),
			(entry) => entry.path,
		)
}

// Function: paletteRows
// `{ item: command, index, selected }` bags for `PaletteRow` rows.
function paletteRows(PaletteRow) {
	return (data) =>
		PaletteRow.map(
			data.items ?? [],
			(item, index) => ({ item, index, selected: data.selected }),
			(command) => command.id,
		)
}

// Function: commandItemRows
// `{ item: command, index }` bags for `CommandItem` rows.
function commandItemRows(CommandItem) {
	return (data) =>
		CommandItem.map(
			data.items ?? [],
			(item, index) => ({ item, index }),
			(command) => command.id ?? `${command.title}:${command.keys}`,
		)
}

// Function: bookmarkRows
// `{ item: { name, path }, index, selected }` bags for `BookmarkRow` rows.
function bookmarkRows(BookmarkRow) {
	return (data) =>
		BookmarkRow.map(
			data.items ?? [],
			(item, index) => ({ item, index, selected: data.selected }),
			(bookmark) => bookmark.name,
		)
}

export { bookmarkRows, commandItemRows, crumbRows, fileRows, paletteRows }

// EOF
