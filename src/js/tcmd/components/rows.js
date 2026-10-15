// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/rows
// Keyed row builders shared by the TUI and web catalogues. Each builder is
// `(self, data) → Component.map(…)`: it turns a parent's data bag into the
// `{ item, index, … }` bags its row components receive, so the bag shape is
// defined once and both renderers stay in sync. `self` is the parent list
// instance — only `fileRows` uses it, to fall back to the measured scrollbox
// height when no viewport is threaded down.
//
// Row state (cursor, marks, selection) is snapshotted into plain per-row
// booleans (`currentRow`, `markedRow`, `selectedRow`) instead of broadcasting
// the shared cells into every row: a shared cell in every row bag makes a move
// re-render all N rows, while a plain per-row flag lets the keyed-map
// reconciliation update only the rows that changed. The builders still read
// the shared sources (they `unwrap` cursor/marked/selected), so they re-run on
// every move and rewrite just the two changed bags. Row behaviors read the
// flags through predicates that fall back to the shared cells for hosts that
// build bags by hand (`isSelected` here, `rowCurrent`/`rowIsMarked` in
// `FileRow`).
//
// Exception: the command panel's rows keep the shared reactive
// `cursor`/`focus` cells, because focus ownership depends on the row type
// (`CommandArgRow.wantsFocus`), which the builders do not know.

import { unwrap } from "select/state/cells"
import { helpBlocks } from "./Help.js"

// Function: isCell
// True when `value` is a reactive cell, using the same `isReactive` marker the
// library itself checks for.
function isCell(value) {
	return Boolean(value && value.isReactive === true)
}

// Function: isSelected
// Whether a bookmark row is the current selection. The plain
// `selectedRow` flag (snapshotted by the row builder) wins over the shared
// `selected` cell, so a move only rewrites the rows that actually changed.
function isSelected(data) {
	if (data.selectedRow !== undefined) return data.selectedRow === true
	return data.index === unwrap(data.selected)
}

// Constant: ROW_WINDOW_MARGIN
// Extra rows rendered above and below the viewport when a pane windows its
// list, so a scroll step or a cursor nudge does not first expose a blank row.
const ROW_WINDOW_MARGIN = 8

// Function: fileWindow
// The windowed slice of a file listing: only `[start, start+len)` rows are
// mounted around the cursor, so a large directory does not lay out thousands of
// off-screen rows every frame. The window follows the cursor with a margin and
// clamps at both ends; `local` is the cursor's index inside the window (what
// the scrollbox tracks) and `total` the full row count. A viewport of 0 (not
// yet known) mounts everything so the layout can be measured.
function fileWindow(data, viewport) {
	const entries = unwrap(data.entries) ?? []
	const total = entries.length
	const cursor = isCell(data.cursor) ? unwrap(data.cursor) : (data.cursor ?? 0)
	const vp = Math.floor(viewport ?? 0)
	if (vp <= 0 || total <= vp) {
		return { start: 0, len: total, local: cursor, total }
	}
	const count = vp + 2 * ROW_WINDOW_MARGIN
	const maxStart = Math.max(0, total - count)
	const start = Math.max(0, Math.min(cursor - ROW_WINDOW_MARGIN, maxStart))
	const len = Math.min(count, total - start)
	return { start, len, local: cursor - start, total }
}

// Function: crumbRows
// `{ item: segment, index, last, paneId }` bags for `Crumb` rows; `last`
// marks the basename, which carries no separator.
function crumbRows(Crumb) {
	return (self, data) => {
		const segments = data.segments ?? []
		const last = segments.length - 1
		return Crumb.map(
			segments,
			(item, index) => ({ item, index, last: index === last, paneId: data.paneId }),
			(segment) => segment.path ?? "…",
		)
	}
}

// Function: fileRows
// `{ item: entry, index, currentRow, markedRow, active, paneId }` bags for
// `FileRow` rows. `currentRow`/`markedRow` are plain per-row booleans
// snapshotted from the shared `cursor`/`marked` sources (cells or plain
// values); the keyed map reconciles them by `$key`, so a cursor move rewrites
// two row bags and leaves the rest untouched. `active` stays the shared
// pane-focus cell, read with `unwrap` by the row behavior so the cursor row
// renders muted in the inactive pane.
function fileRows(FileRow) {
	return (self, data) => {
		const entries = unwrap(data.entries) ?? []
		const cursor = isCell(data.cursor) ? unwrap(data.cursor) : data.cursor
		const marked = isCell(data.marked) ? unwrap(data.marked) : data.marked
		// The viewport height is threaded down reactively (from `uiSize`), so the
		// window is correct from the first render; fall back to the measured
		// scrollbox height on renderers that do not provide it.
		const viewport = unwrap(data.viewport) || self?.ref?.list?.height || 0
		const { start, len } = fileWindow(data, viewport)
		const bag = (item, index) => ({
			item,
			index,
			currentRow: index === cursor,
			markedRow: Boolean(marked?.has?.(item.path)),
			active: data.active,
			paneId: data.paneId,
		})
		if (start === 0 && len === entries.length) {
			return FileRow.map(entries, bag, (entry) => entry.path)
		}
		return FileRow.map(entries.slice(start, start + len), (item, i) => bag(item, start + i), (entry) => entry.path)
	}
}

// Function: commandItemRows
// `{ item: command, index }` bags for `CommandItem` rows.
function commandItemRows(CommandItem) {
	return (self, data) =>
		CommandItem.map(
			data.items ?? [],
			(item, index) => ({ item, index }),
			(command) => command.id ?? `${command.title}:${command.keys}`,
		)
}

// Function: panelOpRows
// `{ item, index, row, cursor, focus }` bags for the command panel's command
// list (`CommandArgRow`). The list is the flat `core/panel.panelEntryRows`: one
// operation per row. `row` is the normalized shape the component reads —
// `name` is the operation name and `summary` its argument list; `risk` tints
// destructive/caution operations.
function panelOpRows(CommandArgRow) {
	return (self, data) =>
		CommandArgRow.map(
			data.items ?? [],
			(item, index) => ({
				item,
				index: item.entryIndex ?? index,
				row: {
					type: "op",
					key: item.id,
					name: item.name,
					summary: item.summary ?? "",
					risk: item.risk ?? null,
				},
				cursor: data.opCursor,
				focus: data.focus,
			}),
			(item) => item.id,
		)
}

// Function: panelArgRows
// `{ item, index, row, cursor, focus, value, labelWidth }` bags for the command
// panel's argument pane (`CommandArgRow`). The rows are the flat
// `core/panel.panelRowList`; this wraps each selection's item run in a top and
// bottom `frame` row so the list reads as one bordered box. `index` is the
// row's flat position (the frame rows take none), so the pane cursor still
// addresses the same rows.
function panelArgRows(CommandArgRow) {
	return (self, data) => {
		const rows = unwrap(data.rows) ?? []
		const visual = []
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i]
			if (row.type !== "item") {
				visual.push(row)
				continue
			}
			const first = i === 0 || rows[i - 1].type !== "item"
			const last = i === rows.length - 1 || rows[i + 1].type !== "item"
			if (first) visual.push({ ...row, type: "frame", variant: "top", key: `frame:top:${row.argIndex}` })
			visual.push(row)
			if (last) visual.push({ ...row, type: "frame", variant: "bottom", key: `frame:bottom:${row.argIndex}` })
		}
		return CommandArgRow.map(
			visual,
			(item, index) => ({
				item,
				index: item.type === "frame" ? -1 : item.rowIndex ?? index,
				row: item,
				cursor: data.argCursor,
				focus: data.focus,
				value: data.value,
				labelWidth: unwrap(data.labelWidth) ?? 8,
			}),
			(item) => item.key,
		)
	}
}

// Function: helpRows
// `{ item, index }` bags for the `?` reference's `HelpRow`s. The blocks are
// precomputed and balanced in `Help.helpBlocks`; `side` picks the column.
function helpRows(HelpRow) {
	return (self, data, side) => {
		const blocks = helpBlocks()[side] ?? []
		return HelpRow.map(
			blocks,
			(item, index) => ({ item, index }),
			(item) => item.key,
		)
	}
}

// Function: bookmarkRows
// `{ item: { name, path }, index, selectedRow }` bags for `BookmarkRow` rows.
// `selectedRow` is the plain per-row selection flag so a picker move rewrites
// only the changed rows.
function bookmarkRows(BookmarkRow) {
	return (self, data) => {
		const selected = isCell(data.selected) ? unwrap(data.selected) : data.selected
		return BookmarkRow.map(
			data.items ?? [],
			(item, index) => ({ item, index, selectedRow: index === selected }),
			(bookmark) => bookmark.name,
		)
	}
}

export { bookmarkRows, commandItemRows, crumbRows, fileRows, fileWindow, helpRows, isSelected, panelArgRows, panelOpRows }

// EOF
