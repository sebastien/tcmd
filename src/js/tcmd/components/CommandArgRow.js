// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandArgRow
// CommandArgRow: one row shared by the command panel's two panes. The left pane
// passes `{ type: "op" }` name-only rows (`risk` tints destructive/caution
// operations) and `{ type: "group" }` headers (White / Amber / Red). The
// right pane passes `{ type: "arg" | "item" | "frame" | "entry" | "parent" | "run" }`
// rows: an argument header shows an aligned label and its value — a bracketed
// field with a distinct background for textual arguments, a summary otherwise;
// an item shows a `[x]`/`[ ]` (or radio) marker with its basename and parent; a
// `frame` draws a selection list's border; and `parent` is the picker's `..`
// navigation row. Reads the row bag `{ item, index, row, cursor, focus, value,
// labelWidth }` built by `rows.js`.
//
// Environment: `accentFg` (focused row), `textFg`, `textSecondaryFg` (summary),
// `textHeadingFg` (general headings), `accentSecondaryFg` (a selected item),
// `errorFg` (destructive op/error), `warningFg` (caution op), `selectionBg`
// (row background), `fieldBg`/`fieldFg` (editable values), `readonlyFg`
// (read-only values), `borderSecondaryFg` (the list border), `focusedClass`
// (web), `icons` (namespace marker).

import { unwrap } from "select/state/cells"

// Function: riskFg
// The colour a row's risk maps to: red for destructive operations, amber for
// caution (a move), null when the row is not risky.
function riskFg(row, env) {
	if ((row?.type === "op" || row?.type === "run") && row.risk === "destructive") return env.errorFg
	if ((row?.type === "op" || row?.type === "run") && row.risk === "caution") return env.warningFg
	return null
}

// Function: groupFg
// Color a risk-group heading like its operations: neutral white, amber caution,
// or red destructive.
function groupFg(group, env) {
	if (group === "Amber") return env.warningFg
	if (group === "Red") return env.errorFg
	return env.textFg
}

// Function: rowName
// The row's label: a group heading, operation name, argument label, `[Run]`
// action, `[x] basename`, or picker entry (directories carry a trailing slash).
function rowName(row) {
	if (!row) return ""
	if (row.type === "group") return row.name ?? ""
	if (row.type === "run") return "[Run]"
	if (row.type === "item") return `${row.marker ?? "[ ]"} ${row.name ?? ""}`
	if (row.type === "parent") return ".."
	if (row.type === "entry") return `${row.name ?? ""}${row.isDir ? "/" : ""}`
	return row.name ?? ""
}

// Function: rowSummary
// The row's right cell: an argument's binding summary (or its value), an
// item's parent directory, or a picker entry's kind.
function rowSummary(row) {
	if (!row) return ""
	if (row.type === "item") return row.parent ?? ""
	if (row.type === "parent") return "parent directory"
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
			if (type(data) === "group") return groupFg(data.row?.group ?? data.row?.name, env)
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
		isOp: (_self, data) => type(data) === "op",
		isGroup: (_self, data) => type(data) === "group",
		isEntry: (_self, data) => type(data) === "entry" || type(data) === "parent",
		isRun: (_self, data) => type(data) === "run",
		hasRunError: (_self, data) => type(data) === "run" && Boolean(data.row?.error),
		isFrame: (_self, data) => type(data) === "frame",
		isList: (_self, data) => isList(data),
		showPlain: (_self, data) => type(data) === "op" || type(data) === "entry" || type(data) === "parent",
		isPlain: (_self, data) => type(data) === "entry" || type(data) === "parent",
		labelWidth: (_self, data) => data.labelWidth ?? 8,
		runMarginTop: (_self, data) => (type(data) === "run" ? 1 : 0),
		runLabel: (_self, data) => (data?.row?.error ? "[Retry]" : "[Run]"),
		runAriaLabel: (_self, data) => (data?.row?.error ? "Retry command" : "Run command"),
		runError: (_self, data) => data.row?.error ?? "",
		runErrorFg: () => env.errorFg,
		runFg: (_self, data) => riskFg(data.row, env) ?? env.textFg,
		groupAttributes: () => env.groupAttributes ?? 0,
		editable: (_self, data) => `${data.row?.editable === true}`,
		// Editable values have a filled bracketed field; read-only summaries
		// stay plain and muted.
		fieldBg: (_self, data) => (data.row?.textual ? env.fieldBg : undefined),
		fieldFg: (_self, data) =>
			data.row?.textual ? (env.fieldFg ?? env.textFg) : (env.readonlyFg ?? env.textSecondaryFg),
		fieldOpen: (_self, data) => (data.row?.textual ? "[" : ""),
		fieldClose: (_self, data) => (data.row?.textual ? "]" : ""),
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
