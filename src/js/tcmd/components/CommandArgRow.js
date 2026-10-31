// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandArgRow
// CommandArgRow: one row shared by the command panel's two panes. The left pane
// passes `{ type: "op" }` name-only rows (`risk` tints caution/destructive
// categories) and `{ type: "group" }` headers (Command / File / Create / Edit / Delete). The
// right pane passes `{ type: "arg" | "item" | "perm" | "frame" | "entry" |
// "parent" | "run" }` rows: an argument header stacks its label over its value
// — a bracketed field with a distinct background for textual arguments, a
// summary otherwise; an item shows a `[x]`/`[ ]` (or radio) marker with its
// basename and parent; `perm` is a `u/g/o` permission class with three r/w/x
// cells; a `frame` draws a selection list's border; and `parent` is the
// picker's `..` navigation row. Reads the row bag
// `{ item, index, row, cursor, focus, permBit, value }`
// built by `rows.js`.
//
// Environment: `accentFg` (focused row), `textFg`, `textSecondaryFg` (summary),
// `textHeadingFg` (general headings), `accentSecondaryFg` (a selected item),
// `errorFg` (destructive op/error), `warningFg` (caution op), `selectionBg`
// (row background), `fieldBg`/`fieldFg` (editable values), `readonlyFg`
// (read-only values), `borderSecondaryFg` (the list border), `focusedClass`
// (web), `icons` (namespace marker).

import { unwrap } from "select/state/cells"
import { PERMISSION_BITS } from "../core/permissions.js"

// Function: riskFg
// The colour a row's category maps to: red for Delete, amber for Edit, null
// when the row is neither.
function riskFg(row, env) {
	if ((row?.type === "op" || row?.type === "run") && row.risk === "destructive") return env.errorFg
	if ((row?.type === "op" || row?.type === "run") && row.risk === "caution") return env.warningFg
	return null
}

// Function: groupFg
// Color the purpose-group headings: Edit is amber and Delete is red.
function groupFg(group, env) {
	if (group === "Edit") return env.warningFg
	if (group === "Delete") return env.errorFg
	return env.textFg
}

// Function: rowName
// The row's label: a group heading, operation name, argument label, `[Run]`
// action, `[x] basename`, or picker entry (directories carry a trailing slash).
function rowName(row) {
	if (!row) return ""
	if (row.type === "group") return row.name ?? ""
	if (row.type === "run") return row.error ? "[Retry]" : row.armed ? "[Confirm]" : "[Run]"
	if (row.type === "item") return `${row.marker ?? "[ ]"} ${row.name ?? ""}`
	if (row.type === "perm") return row.label ?? ""
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

// Function: stemEnd
// Where a name's stem ends: the last dot, or the whole name when there is no
// extension. A leading dot (a dotfile) counts as no extension, so its whole
// name is selected. `rename` uses this to preselect `notes` in `notes.txt`
// while keeping the extension.
function stemEnd(name) {
	const text = `${name ?? ""}`
	const at = text.lastIndexOf(".")
	return at > 0 ? at : text.length
}

// Function: selectStem
// Focus handler for a rename TO field: when the field still matches FROM, the
// stem is selected so typing replaces the name and keeps the extension. Works
// on both presentations — the web input exposes `setSelectionRange`, the TUI
// input `setSelection`.
function selectStem(self, data, event) {
	if (data?.row?.selectStem !== true || data?.row?.diff?.unchanged !== true) return
	const input = event?.target ?? self?.ref?.valueInput
	if (!input) return
	const text = `${input.value ?? unwrap(data?.value) ?? ""}`
	const end = stemEnd(text)
	if (end <= 0) return
	if (typeof input.setSelectionRange === "function") input.setSelectionRange(0, end)
	else if (typeof input.setSelection === "function") input.setSelection(0, end)
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
	// A permission row has three bit cells; the bit cursor marks the one Space
	// toggles, and a click toggles the cell it lands on.
	const bits = (data) => data.row?.bits ?? []
	const bitAt = (data, index) => bits(data)[index]
	const bitFocused = (data, index) => focused(data) && (unwrap(data.permBit) ?? 0) === index
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
	const behaviors = {
		editing,
		// A rename TO field starts on the same name as FROM, so focusing it
		// selects the stem for a quick replacement (see `selectStem`).
		selectStem,
		// --- shared row content ---
		marker: (_self, data) => (focused(data) ? ">" : " "),
		markerFg: () => env.accentFg,
		// An argument's label sits on its own line, above the value.
		name: (_self, data) => rowName(data.row),
		// A permission row: its class label and three bit cells.
		permClass: (_self, data) => data.row?.label ?? data.row?.classId ?? "",
		isPerm: (_self, data) => type(data) === "perm",
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
		// A rename TO row adds a third line comparing the new name with FROM:
		// the common parts dim, the replaced middle of each side highlighted,
		// or `(unchanged)` while both names still match.
		hasDiff: (_self, data) => Boolean(data.row?.diff),
		diffChanged: (_self, data) => data.row?.diff?.unchanged === false,
		diffUnchanged: (_self, data) => data.row?.diff?.unchanged === true,
		diffUnchangedText: () => "(unchanged)",
		diffFromPrefix: (_self, data) => data.row?.diff?.prefix ?? "",
		diffFromChanged: (_self, data) => data.row?.diff?.fromChanged ?? "",
		diffFromSuffix: (_self, data) => data.row?.diff?.suffix ?? "",
		diffArrow: () => " → ",
		diffToPrefix: (_self, data) => data.row?.diff?.prefix ?? "",
		diffToChanged: (_self, data) => data.row?.diff?.toChanged ?? "",
		diffToSuffix: (_self, data) => data.row?.diff?.suffix ?? "",
		diffDimFg: () => env.textSecondaryFg,
		diffRemovedFg: () => env.warningFg,
		diffAddedFg: () => env.accentSecondaryFg,
		// An argument stacks its label over its value; a diff adds a third
		// line. Every other row is one line tall.
		rowHeight: (_self, data) => (type(data) === "arg" ? (data.row?.diff ? 3 : 2) : 1),
		runMarginTop: (_self, data) => (type(data) === "run" ? 1 : 0),
		runLabel: (_self, data) => (data?.row?.error ? "[Retry]" : data?.row?.armed ? "[Confirm]" : "[Run]"),
		runAriaLabel: (_self, data) =>
			data?.row?.error ? "Retry command" : data?.row?.armed ? "Confirm command" : "Run command",
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
		textual: (_self, data) => data.row?.textual === true,
		fieldOpen: (_self, data) => (data.row?.textual ? "[" : ""),
		fieldClose: (_self, data) => (data.row?.textual ? "]" : ""),
		// Selection lists share the argument pane's one-cell inset; the spacer
		// is NBSP so the renderers do not collapse the leading run.
		rowIndent: (_self, data) => (isList(data) ? 1 : 0),
		listIndent: (_self, data) => 1,
		listSpacer: (_self, data) => "\u00a0",
		listBorder: (_self, data) => {
			if (type(data) !== "frame") return ["left", "right"]
			return data.row?.variant === "top" ? ["top", "left", "right"] : ["bottom", "left", "right"]
		},
		borderFg: () => env.borderSecondaryFg,
	}
	// r/w/x cells of a permission row, in the shared permission order so the
	// templates can bind each cell without looping.
	for (let i = 0; i < PERMISSION_BITS.length; i++) {
		const bit = PERMISSION_BITS[i]
		const name = bit.id.toUpperCase()
		behaviors[`perm${name}`] = (_self, data) => (bitAt(data, i)?.selected ? bit.id : "-")
		behaviors[`perm${name}On`] = (_self, data) => `${bitAt(data, i)?.selected === true}`
		behaviors[`perm${name}Fg`] = (_self, data) =>
			bitAt(data, i)?.selected ? env.accentSecondaryFg : env.textSecondaryFg
		behaviors[`perm${name}Bg`] = (_self, data) =>
			bitFocused(data, i) ? env.accentSecondaryBg : undefined
		behaviors[`perm${name}Class`] = (_self, data) =>
			[
				bitAt(data, i)?.selected ? "is-on" : "is-off",
				bitFocused(data, i) ? "is-bit-focused" : null,
			]
				.filter(Boolean)
				.join(" ")
	}
	return behaviors
}

export { createBehaviors, isFocused, riskFg, rowName, rowSummary, selectStem, stemEnd, wantsFocus }
