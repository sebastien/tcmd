// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandArgRow
// CommandArgRow: one row shared by both command-panel columns. The operation
// column passes `{ type: "op" }` rows (name = operation title, summary =
// signature, `risk` tints destructive/caution operations); the argument column
// passes `{ type: "arg" | "item" }` rows from `core/panel.panelRowList`. An
// item shows a `[x]`/`[ ]` toggle with its basename and, dimmed after it, the
// parent directory; a focused row carries a `>` marker so focus is not
// colour-only. Reads the row bag `{ item, index, row, cursor, focus }` built by
// `rows.js`.
//
// Environment: `accentFg` (focused row), `textFg`, `textSecondaryFg` (summary),
// `accentSecondaryFg` (a selected item), `errorFg` (destructive op),
// `warningFg` (caution op), `selectionBg` (row background), `focusedClass`
// (web).

import { unwrap } from "select/state/cells"

// Function: riskFg
// The colour a row's risk maps to: red for destructive operations, amber for
// caution (a move), null when the row is not risky.
function riskFg(row, env) {
	if (row?.type === "op" && row.risk === "destructive") return env.errorFg
	if (row?.type === "op" && row.risk === "caution") return env.warningFg
	return null
}

// Function: rowName
// The row's left cell: the operation title, an argument's name, or an item's
// `[x] basename`.
function rowName(row) {
	if (!row) return ""
	if (row.type === "item") return `${row.marker ?? "[ ]"} ${row.name ?? ""}`
	return row.name ?? ""
}

// Function: rowSummary
// The row's right cell: the operation signature, an argument's binding
// summary, or an item's parent directory.
function rowSummary(row) {
	if (!row) return ""
	if (row.type === "item") return row.parent ?? ""
	if (row.type === "op") return row.summary ?? ""
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
		name: (_self, data) => rowName(data.row),
		rowBg: (_self, data) => (focused(data) ? env.selectionBg : undefined),
		rowClass: (_self, data) => (focused(data) ? env.focusedClass : null),
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
