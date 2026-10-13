// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandArgRow
// CommandArgRow: one row shared by both command-panel columns. The entry
// column passes `{ type: "op" }` rows (name = entry name, summary = signature
// or key shortcut, `risk` tints destructive/caution operations, and `source`
// marks the namespace — a CLI operation or a TinyCmd action); the argument
// column passes `{ type: "arg" | "item" }` rows from `core/panel.panelRowList`.
// An item shows a `[x]`/`[ ]` toggle with its basename and, dimmed after it,
// the parent directory; a focused row carries a `>` marker so focus is not
// colour-only. Reads the row bag `{ item, index, row, cursor, focus }` built by
// `rows.js`.
//
// Environment: `accentFg` (focused row), `textFg`, `textSecondaryFg` (summary),
// `accentSecondaryFg` (a selected item), `errorFg` (destructive op),
// `warningFg` (caution op), `selectionBg` (row background), `focusedClass`
// (web), `icons` (namespace marker: Nerd Font glyph, or its text fallback).

import { unwrap } from "select/state/cells"
import { sourceMarker } from "./icons.js"

// Function: riskFg
// The colour a row's risk maps to: red for destructive operations, amber for
// caution (a move), null when the row is not risky.
function riskFg(row, env) {
	if (row?.type === "op" && row.risk === "destructive") return env.errorFg
	if (row?.type === "op" && row.risk === "caution") return env.warningFg
	return null
}

// Function: rowName
// The row's left cell: an entry prefixed with its namespace marker, an
// argument's name, an item's `[x] basename`, or a picker entry (directories
// carry a trailing slash so they read apart from files).
function rowName(row, icons) {
	if (!row) return ""
	if (row.type === "item") return `${row.marker ?? "[ ]"} ${row.name ?? ""}`
	if (row.type === "entry") return `${row.name ?? ""}${row.isDir ? "/" : ""}`
	if (row.type === "op" && row.source) return `${sourceMarker(row.source, icons)} ${row.name ?? ""}`
	return row.name ?? ""
}

// Function: rowSummary
// The row's right cell: an entry's argument list or key shortcut, an
// argument's binding summary, an item's parent directory, or a picker entry's
// kind (a symlink names where it points).
function rowSummary(row) {
	if (!row) return ""
	if (row.type === "item") return row.parent ?? ""
	if (row.type === "entry") {
		if (row.isSymlink && row.target) return `${row.target}`
		return row.isDir ? "dir" : ""
	}
	return row.summary ?? ""
}

// Function: wantsFocus
// The focus token a row belongs to: the operation column ("ops") or the
// argument column ("args").
function wantsFocus(row) {
	return row?.type === "op" ? "ops" : "args"
}

// Function: isFocused
// True when this row owns the cursor in the focused column.
function isFocused(row, index, cursor, focus) {
	if (!row || !focus) return false
	return focus === wantsFocus(row) && index === cursor
}

// Function: createBehaviors
// Builds the CommandArgRow behavior map for the given renderer environment.
function createBehaviors(env) {
	const focused = (data) => isFocused(data.row, data.index, unwrap(data.cursor), unwrap(data.focus))
	return {
		marker: (_self, data) => (focused(data) ? ">" : " "),
		markerFg: () => env.accentFg,
		name: (_self, data) => rowName(data.row, env.icons),
		rowBg: (_self, data) => (focused(data) ? env.selectionBg : undefined),
		rowClass: (_self, data) => (focused(data) ? env.focusedClass : null),
		rowSelected: (_self, data) => `${data.row?.selected === true}`,
		rowFg: (_self, data) => {
			// A risky operation (delete/erase/move) is always tinted — even
			// focused — so danger reads at a glance; focus is carried by the
			// `>` marker and the row background instead.
			const risk = riskFg(data.row, env)
			if (risk) return risk
			if (focused(data)) return env.accentFg
			if (data.row?.type === "item" && data.row?.selected) return env.accentSecondaryFg
			return env.textFg
		},
		summary: (_self, data) => rowSummary(data.row),
		summaryFg: () => env.textSecondaryFg,
	}
}

export { createBehaviors, isFocused, riskFg, rowName, rowSummary, wantsFocus }
