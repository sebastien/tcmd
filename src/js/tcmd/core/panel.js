// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/core/panel
// The command panel (Commando): the one entry point for the CLI operations
// (`copy`, `move`, `rename`, `replace`, `delete`, `run` — the `core/operations` registry).
// They are grouped by risk color (White, Amber, Red) and alphabetized within
// each group (see `filterPanelEntries`). The internal TinyCmd actions are not
// listed here — they live on their own keys.
//
// For the selected operation, the panel binds its arguments from the live
// context — a selection argument shows the SRC/DST pane's marked paths (falling
// back to the cursor entry) and lets the user toggle individual items; a
// destination argument resolves to the DST pane's directory; textual arguments
// (a name, a buffer label, a shell command) are typed in place.
//
// The selection the user tweaks is *transient*: it lives in the draft bindings
// (`session.panelDraft`), never in the real pane marks. When the draft runs,
// each selection argument is encoded as a self-contained `$paths:[…]` token, so
// the resolved paths survive an async confirm (see `expandArg`). The draft can
// also be rendered as a shell-quoted command (`panelCommand`), while the panel
// itself presents the arguments and an explicit Run action.
// Everything here is pure: the caller owns the cells; the panel commands in
// `core/commands` assemble and run.

import { hasMatch } from "../vendor/fzy.js"
import { currentPaneId, PANE_BUFFERS, PANE_LABELS } from "./pane.js"
import { basename, parent } from "./path.js"
import { getOperations, pathToken } from "./operations.js"

// Constant: PANEL_FOCUS
// The two regions the panel's focus ring moves through: "ops" (the filter and
// the command list on the left) and "args" (an argument row or item in the
// right pane, where a textual argument owns the keyboard and Space toggles a
// selection item).
const PANEL_FOCUS = { OPS: "ops", ARGS: "args" }
const PANEL_GROUPS = ["White", "Amber", "Red"]

// Function: groupForRisk
// The command list's visual group: normal operations are white, caution amber,
// and destructive red.
function groupForRisk(risk) {
	if (risk === "caution") return "Amber"
	if (risk === "destructive") return "Red"
	return "White"
}

// Function: panelEntries
// The entries the panel lists: the CLI operations. They are the only namespace
// — the internal TinyCmd actions are reached by their own keys, not the panel.
function panelEntries() {
	return getOperations()
		.filter((op) => !op.hidden)
		.map((op) => ({
			id: `op:${op.name}`,
			name: op.name,
			group: groupForRisk(op.risk),
			risk: op.risk ?? null,
			matchNames: [op.name, ...(op.aliases ?? [])],
			op,
		}))
}

// Function: compareEntries
// The panel's fixed risk-color order, then alphabetical command order.
function compareEntries(a, b) {
	const groupA = PANEL_GROUPS.indexOf(`${a?.group ?? "White"}`)
	const groupB = PANEL_GROUPS.indexOf(`${b?.group ?? "White"}`)
	const rankA = groupA < 0 ? PANEL_GROUPS.length : groupA
	const rankB = groupB < 0 ? PANEL_GROUPS.length : groupB
	return rankA - rankB || `${a?.name ?? ""}`.localeCompare(`${b?.name ?? ""}`)
}

// Function: filterPanelEntries
// Narrows the entry list by command name or alias and keeps the fixed
// White/Amber/Red group order and alphabetical order within each group.
function filterPanelEntries(entries, query) {
	const list = entries ?? []
	const q = `${query ?? ""}`.trim().toLowerCase()
	if (!q) return [...list].sort(compareEntries)
	return list
		.filter((entry) => (entry.matchNames ?? []).some((name) => hasMatch(q, `${name}`.toLowerCase())))
		.sort(compareEntries)
}

// Function: panelEntryRows
// Projects filtered entries into the command-list column: a group heading and
// one name-only `op` row per entry, tagged with its index in the *entries* list
// (what the cursor `panelOpIndex` addresses).
function panelEntryRows(entries) {
	const rows = []
	let previousGroup = null
	for (let index = 0; index < (entries ?? []).length; index++) {
		const entry = entries[index]
		const group = entry.group ?? "White"
		if (group !== previousGroup) {
			rows.push({ type: "group", id: `group:${group.toLowerCase()}`, name: group, group })
			previousGroup = group
		}
		rows.push({
			type: "op",
			id: entry.id,
			entryIndex: index,
			name: entry.name,
			group,
			risk: entry.risk,
		})
	}
	return rows
}

// Function: explorerColumnId
// The column an explorer argument draws from: the *focused* one, so focusing
// the parent mirror selects from its own listing — the current directory, a
// directory — and focusing the preview selects from the directory it mirrors.
// A focused column without a listing (the inspector over a file) falls back to
// the pane that owns the current directory, matching `core/commands#pane`.
function explorerColumnId(session) {
	const active = session.active?.value
	if (active === "parent") return active
	if (
		active === "preview" &&
		session.showPreview?.value &&
		session.previewEntry?.value?.isDir &&
		!session.preview?.value
	) {
		return active
	}
	return currentPaneId(session)
}

// Function: resolvePaneId
// Maps an argument role to a pane id: "source" -> the working pane (SRC in
// commander; in explorer the focused column, which may be either side of the
// chain), "dest" -> DST (right), anything else -> the pane holding the current
// directory (the focused column in explorer, never an auxiliary column with no
// listing, so operations run against what the cursor shows).
function resolvePaneId(session, role) {
	if (role === "dest") return "right"
	if (session.viewMode?.value === "explorer") return explorerColumnId(session)
	if (role === "source") return "left"
	return currentPaneId(session)
}

// Function: paneSelectionPaths
// The paths a selection argument draws from a pane: its marked set, or the
// cursor entry when nothing is marked. An empty listing yields nothing.
function paneSelectionPaths(pane) {
	const marked = [...(pane?.marked?.value ?? [])]
	if (marked.length) return marked
	const entry = pane?.currentEntry?.()
	return entry ? [entry.path] : []
}

// Function: itemFor
// One toggleable selection item: the path plus the listing name/kind when the
// pane lists it (filesets can name paths outside the current listing). The
// parent directory rides along so the row can show where the path lives.
function itemFor(index, path) {
	const entry = index?.get?.(path)
	return {
		path,
		name: entry?.name ?? basename(path),
		parent: parent(path) ?? "",
		isDir: Boolean(entry?.isDir),
		selected: true,
	}
}

// Function: entryIndex
// A `path -> entry` map for a pane's current listing, so binding many marked
// paths does not rescan the listing per path.
function entryIndex(pane) {
	const index = new Map()
	for (const entry of pane?.entries?.value ?? []) index.set(entry.path, entry)
	return index
}

// Function: bindArg
// Binds one argument descriptor to the live context, producing the draft
// binding the panel renders and toggles.
function bindArg(session, arg, index) {
	const role = arg.role ?? "active"
	const common = {
		index,
		name: arg.name,
		kind: arg.kind,
		role,
		optional: arg.optional === true,
		variadic: arg.variadic === true,
		textual:
			arg.kind === "literal" || arg.kind === "raw" || arg.kind === "buffer" || arg.kind === "path",
	}
	if (arg.kind === "selection") {
		const paneId = resolvePaneId(session, role)
		const pane = session.panes[paneId]
		const entries = entryIndex(pane)
		return {
			...common,
			paneId,
			// A variadic selection accepts many marked paths (checkboxes); a
			// single-path argument accepts one (a radio list).
			multi: arg.variadic === true,
			items: paneSelectionPaths(pane).map((path) => itemFor(entries, path)),
			value: "",
		}
	}
	if (arg.kind === "dest" || arg.kind === "path") {
		// A destination or a path argument is typeable in place, like a
		// literal, and additionally browsable through the panel's file picker
		// (`picker: true`, opened with `panel.browse`). In commander mode the
		// DST pane is the natural destination, so a directory argument
		// pre-fills from it; explorer mode has no destination pane, so it opens
		// empty for the picker (or the user) to fill.
		const mode = arg.kind === "dest" ? "dir" : arg.mode ?? "any"
		const commander = (session.viewMode?.value ?? "commander") !== "explorer"
		const value = mode === "dir" && commander ? session.panes?.right?.path?.value ?? "" : ""
		return { ...common, textual: true, picker: true, mode, items: [], value }
	}
	if (arg.kind === "buffer") {
		const label = PANE_BUFFERS[session.currentId?.value ?? session.active.value] ?? "A"
		return { ...common, items: [], value: `+${label}` }
	}
	return { ...common, items: [], value: "" }
}

// Function: bindArgs
// Binds every argument of the selected entry to the live context. Every
// operation carries an `args` signature.
function bindArgs(session, entry) {
	return (entry?.op?.args ?? []).map((arg, index) => bindArg(session, arg, index))
}

// Function: selectedPaths
// The paths a binding currently contributes (selected items).
function selectedPaths(binding) {
	return (binding?.items ?? []).filter((item) => item.selected).map((item) => item.path)
}

// Function: argTokens
// The untrimmed token each binding contributes: a selection its encoded
// `$paths:` token, a destination its path, a textual arg its value. Shared by
// `argvFor` (which trims trailing placeholders) and `missingArg` (which needs
// them to spot gaps).
function argTokens(bindings) {
	return (bindings ?? []).map((binding) => {
		if (binding.kind === "selection") {
			const paths = selectedPaths(binding)
			return paths.length ? pathToken(paths) : ""
		}
		if (binding.kind === "dest") return binding.value ?? ""
		return `${binding.value ?? ""}`.trim()
	})
}

// Function: argvFor
// The token array `runOperation` consumes for the draft (see `argTokens`). An
// empty textual optional keeps a `""` placeholder so later positional args do
// not shift; trailing placeholders are trimmed (arity counts non-empty tokens,
// so `bookmark NAME` with no PATH still means "remove NAME").
function argvFor(bindings) {
	const args = argTokens(bindings)
	while (args.length && args[args.length - 1] === "") args.pop()
	return args
}

// Function: missingBinding
// The first binding that is not runnable: a required argument left blank, an
// optional one before a filled one (a positional gap would shift the following
// tokens), or a selection with nothing selected. Returns null when the argv is
// runnable. The panel uses it both to flag an unrunnable draft and to focus the
// next thing to fill when Enter lands on an incomplete command.
function missingBinding(bindings) {
	const list = bindings ?? []
	const args = argTokens(list)
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === "") return list[i]
	}
	// A trailing required argument must still be filled.
	const trailing = list[list.length - 1]
	if (trailing && args[args.length - 1] === "" && trailing.optional !== true) return trailing
	return null
}

// Function: missingArg
// The name of the first argument that is not runnable (see `missingBinding`),
// or null when the argv is runnable.
function missingArg(bindings) {
	return missingBinding(bindings)?.name ?? null
}

// Function: shellQuote
// Quotes a token for display as it would appear in a shell: bare when it is
// already safe (`/home/a`), single-quoted when it contains spaces or shell
// metacharacters (`'my notes.txt'`). Only the last path segment matters in
// practice, but quoting the whole token keeps the preview copy-pasteable.
function shellQuote(token) {
	const text = `${token ?? ""}`
	if (text === "") return "''"
	return /^[A-Za-z0-9_@%+=:,.\/-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`
}

// Function: panelCommand
// The command line the draft maps to: each argument rendered as the value it
// contributes — a selection as its selected paths, a destination/textual arg
// as its value — quoted as it would appear in a shell. A required argument left
// empty shows a `«NAME»` placeholder so the mapping stays legible, and an empty
// optional argument is omitted (it contributes no token). This is the "resolved
// command" the panel previews in full.
function panelCommand(bindings) {
	const parts = []
	for (const binding of bindings ?? []) {
		if (binding.kind === "selection") {
			const paths = selectedPaths(binding)
			if (paths.length) parts.push(...paths.map(shellQuote))
			else if (binding.optional !== true) parts.push(`«${binding.name}»`)
			continue
		}
		const value = `${binding.value ?? ""}`.trim()
		if (value) parts.push(shellQuote(value))
		else if (binding.optional !== true) parts.push(`«${binding.name}»`)
	}
	return parts.join(" ")
}

// Function: panelRunnable
// True when the draft has no missing required argument (see `missingArg`).
function panelRunnable(bindings) {
	return missingArg(bindings) === null
}

// Function: panelSummary
// One-line description of a binding for the panel: the pane and selected count
// for a selection, the value for a destination/textual arg.
function panelSummary(binding) {
	if (!binding) return ""
	if (binding.kind === "selection") {
		const pane =
			PANE_LABELS[binding.paneId] ??
			(binding.role === "source" ? "SRC" : binding.role === "dest" ? "DST" : "PANE")
		const count = selectedPaths(binding).length
		return `${pane} · ${count} selected`
	}
	if (binding.kind === "dest" || binding.kind === "path") return binding.value || "(none)"
	if (binding.kind === "buffer") return binding.value || "(active)"
	return binding.value ? binding.value : "(empty)"
}

// Function: panelRowList
// Flattens the draft into the rows the panel's right-hand argument pane
// renders: one header row per argument (its label and value/summary),
// followed by one item row per selected path of a selection argument (so
// individual paths can be toggled). A variadic selection shows checkboxes
// (`[x]`/`[ ]`); a single-path one shows radios (`(•)`/`( )`). Row focus is
// assigned by the view (comparing the row index to the cursor), the same way
// list rows are; this stays pure and index-stable.
function panelRowList(bindings) {
	const rows = []
	for (const binding of bindings ?? []) {
		const multi = binding.multi === true
		const items = binding.items ?? []
		// A selection that resolves to a single path is not a list: it renders
		// as a pre-filled, read-only path (no checkbox/radio to pick from).
		const single = items.length === 1
		rows.push({
			type: "arg",
			key: `arg:${binding.index}`,
			rowIndex: rows.length,
			argIndex: binding.index,
			itemIndex: -1,
			name: binding.name,
			summary: single ? items[0].path : panelSummary(binding),
			kind: binding.kind,
			role: binding.role,
			optional: binding.optional,
			variadic: binding.variadic,
			textual: binding.textual,
			editable: binding.textual === true,
			picker: binding.picker === true,
			mode: binding.mode ?? null,
			multi,
			readonly: single,
			value: binding.value,
			count: items.length,
		})
		if (single) continue
		for (let i = 0; i < items.length; i++) {
			const item = items[i]
			const selected = item.selected
			const marker = multi ? (selected ? "[x]" : "[ ]") : selected ? "(•)" : "( )"
			rows.push({
				type: "item",
				key: `item:${binding.index}:${item.path}`,
				rowIndex: rows.length,
				argIndex: binding.index,
				itemIndex: i,
				name: item.name,
				path: item.path,
				parent: item.parent ?? "",
				isDir: item.isDir,
				selected,
				multi,
				marker,
			})
		}
	}
	return rows
}

// Function: rowAt
// The argument row at the cursor `index`, or null.
function rowAt(rows, index) {
	return (rows ?? [])[index] ?? null
}

// Function: pickerRowList
// Flattens the picker's visible listing into the rows the panel's argument
// column renders while a path is being picked. The parent navigation row stays
// visible when filtering and is omitted at the filesystem root; entry rows
// retain their path and symlink target for the shared row component.
function pickerRowList(entries, path) {
	const rows = []
	const parentPath = parent(path)
	if (parentPath) {
		rows.push({
			type: "parent",
			key: `parent:${path}`,
			name: "..",
			path: parentPath,
			isDir: true,
		})
	}
	for (const entry of entries ?? []) {
		rows.push({
			type: "entry",
			key: entry.path,
			name: entry.name,
			path: entry.path,
			isDir: entry.isDir === true,
			isSymlink: entry.isSymlink === true,
			target: entry.target ?? null,
		})
	}
	return rows
}

// Function: isTextualRow
// True when the cursor row is an argument header that takes free text, so the
// panel focuses its edit field.
function isTextualRow(row) {
	return Boolean(row && row.type === "arg" && row.textual)
}

// Function: withToggledItem
// Returns a new draft with item `itemIndex` of argument `argIndex` toggled,
// leaving the other bindings untouched. A single-path argument (`multi` false)
// is a radio list: choosing one selects it alone.
function withToggledItem(draft, argIndex, itemIndex, multi = true) {
	return (draft ?? []).map((binding) => {
		if (binding.index !== argIndex) return binding
		const items = (binding.items ?? []).map((item, i) =>
			multi ? (i === itemIndex ? { ...item, selected: !item.selected } : item) : { ...item, selected: i === itemIndex },
		)
		return { ...binding, items }
	})
}

// Function: withArgValue
// Returns a new draft with the value of argument `argIndex` set.
function withArgValue(draft, argIndex, value) {
	return (draft ?? []).map((binding) =>
		binding.index === argIndex ? { ...binding, value } : binding,
	)
}

// Function: bindingAt
// The draft binding for an argument index, or null.
function bindingAt(draft, argIndex) {
	return (draft ?? []).find((binding) => binding.index === argIndex) ?? null
}

// Convenience re-exports: the `$paths:` token helpers live in `core/operations`
// (where `expandArg` decodes them); the panel is their only producer.
export { decodePathToken, pathToken } from "./operations.js"

export {
	PANEL_FOCUS,
	argvFor,
	bindArg,
	bindArgs,
	bindingAt,
	filterPanelEntries,
	isTextualRow,
	missingArg,
	missingBinding,
	panelCommand,
	panelEntries,
	panelEntryRows,
	panelRowList,
	panelRunnable,
	panelSummary,
	paneSelectionPaths,
	pickerRowList,
	rowAt,
	selectedPaths,
	withArgValue,
	withToggledItem,
}
