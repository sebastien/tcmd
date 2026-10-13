// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandArgRow
// CommandArgRow: one row shared by the command panel's two panes. The left pane
// passes `{ type: "op" }` rows (name = entry name, summary = signature or key
// shortcut, `risk` tints destructive/caution operations, `source` marks the
// namespace) and `{ type: "group" }` header rows ("System" / "Commands"). The
// right pane passes `{ type: "arg" | "item" | "frame" | "entry" }` rows: an
// argument header shows an aligned label and its value — a bracketed field with
// a distinct background for a textual argument, a summary otherwise; an item
// shows a `[x]`/`[ ]` (or radio) marker with its basename and parent; and a
// `frame` row draws the top/bottom of the bordered list a selection's items sit
// in. Reads the row bag `{ item, index, row, cursor, focus, value, labelWidth }`
// built by `rows.js`.
//
// Environment: `accentFg` (focused row), `textFg`, `textSecondaryFg` (summary),
// `textHeadingFg` (a group header), `accentSecondaryFg` (a selected item),
// `errorFg` (destructive op), `warningFg` (caution op), `selectionBg` (row
// background), `fieldBg`/`fieldFg` (the value field), `borderSecondaryFg` (the
// list border), `focusedClass` (web), `icons` (namespace marker).

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
// The row's left cell: a group header's label, an operation's name, an
// argument's label, an item's `[x] basename`, or a picker entry (directories
// carry a trailing slash).
function rowName(row) {
	if (!row) return ""
	if (row.type === "group") return row.name ?? ""
	if (row.type === "item") return `${row.marker ?? "[ ]"} ${row.name ?? ""}`
	if (row.type === "entry") return `${row.name ?? ""}${row.isDir ? "/" : ""}`
	return row.name ?? ""
}

// Function: rowSummary
// The row's right cell: an entry's argument list or key shortcut, an argument's
// binding summary (or its value), an item's parent directory, or a picker
// entry's kind.
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
// The focus token a row belongs to: the command list ("ops"), the argument
// pane ("args"), or none (a group header or a list frame never takes the
// cursor).
function wantsFocus(row) {
	if (row?.type === "group" || row?.type === "frame") return "none"
	return row?.type === "op" ? "ops" : "args"
}

// Function: isFocused
// True when this row owns the cursor in the focused region.
function isFocused(row, index, cursor, focus) {
	if (!row || !focus || row.type === "group" || row.type === "frame") return false
	return focus === wantsFocus(row) && index === cursor
}

// Function: createBehaviors
// Builds the CommandArgRow behavior map for the given renderer environment.
function createBehaviors(env) {
	const focused = (data) => isFocused(data.row, data.index, unwrap(data.cursor), unwrap(data.focus))
	const type = (data) => data.row?.type
	const isList = (data) => type(data) === "item" || type(data) === "frame"
	// The web classes that draw a selection's list box: the item rows carry the
	// sides, the frame rows the top/bottom.
	const listClass = (data) => {
		if (!isList(data)) return null
		if (type(data) === "frame") return data.row?.variant === "top" ? "is-list-top" : "is-list-bottom"
		return "is-list-item"
	}
	// A textual argument header edits in place while it owns the cursor: its
	// summary yields to a value input bound to the panel's edit cell.
	const editing = (_self, data) => focused(data) && type(data) === "arg" && data.row?.textual === true
	return {
		editing,
		// --- shared row content ---
		marker: (_self, data) => (focused(data) ? ">" : " "),
		markerFg: () => env.accentFg,
		// An argument label is padded to the column width so values line up
		// across arguments (both renderers honor the spaces).
		name: (_self, data) => {
			const text = rowName(data.row)
			return type(data) === "arg" ? text.padEnd(data.labelWidth ?? 8) : text
		},
		rowBg: (_self, data) => (focused(data) ? env.selectionBg : undefined),
		rowClass: (_self, data) =>
			[focused(data) ? env.focusedClass : null, listClass(data)].filter(Boolean).join(" ") || null,
		rowSelected: (_self, data) => `${data.row?.selected === true}`,
		rowFg: (_self, data) => {
			if (type(data) === "group") return env.textHeadingFg
			const risk = riskFg(data.row, env)
			if (risk) return risk
			if (focused(data)) return env.accentFg
			if (type(data) === "item" && data.row?.selected) return env.accentSecondaryFg
			return env.textFg
		},
		summary: (_self, data) => rowSummary(data.row),
		summaryFg: () => env.textSecondaryFg,
		// The list branch repeats the marker/name/summary nodes, so it carries
		// its own out-names (duplicate `out` names in one template collide).
		listMarker: (_self, data) => (focused(data) ? ">" : " "),
		listName: (_self, data) => rowName(data.row, env.icons),
		listSummary: (_self, data) => rowSummary(data.row),
		// --- layout branches ---
		isArg: (_self, data) => type(data) === "arg",
		isItem: (_self, data) => type(data) === "item",
		isFrame: (_self, data) => type(data) === "frame",
		isList: (_self, data) => isList(data),
		isPlain: (_self, data) => !isList(data) && type(data) !== "arg",
		labelWidth: (_self, data) => data.labelWidth ?? 8,
		// The value field: a distinct background and a `[ ]` frame.
		fieldBg: () => env.fieldBg,
		fieldFg: () => env.fieldFg ?? env.textFg,
		fieldOpen: () => "[",
		fieldClose: () => "]",
		// The list indents under the value column: the marker (2) plus the gap
		// (1) plus the label column plus the gap (1). The spacer is NBSP so the
		// renderers do not collapse the leading run.
		rowIndent: (_self, data) => (isList(data) ? 4 + (data.labelWidth ?? 8) : 0),
		listIndent: (_self, data) => 4 + (data.labelWidth ?? 8),
		listSpacer: (_self, data) => "\u00a0".repeat(4 + (data.labelWidth ?? 8)),
		listBorder: (_self, data) => {
			if (type(data) !== "frame") return ["left", "right"]
			return data.row?.variant === "top" ? ["top", "left", "right"] : ["bottom", "left", "right"]
		},
		borderFg: () => env.borderSecondaryFg,
	}
}

export { createBehaviors, isFocused, riskFg, rowName, rowSummary, wantsFocus }
