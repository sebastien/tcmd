// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/core/panel
// The command panel (Commando): a structured view over the operation registry.
// It lists the operations and, for the selected one, its arguments bound from
// the live context — a selection argument shows the SRC/DST pane's marked paths
// (falling back to the cursor entry) and lets the user toggle individual items;
// a destination argument resolves to the DST pane's directory; textual
// arguments (a name, a buffer label, a shell command) are typed in place.
//
// The selection the user tweaks is *transient*: it lives in the draft bindings
// (`session.panelDraft`), never in the real pane marks. When the draft runs,
// each selection argument is encoded as a self-contained `$paths:[…]` token, so
// the resolved paths survive an async confirm (see `expandArg`). The same draft
// assembles the command line the panel previews (`panelCommand`), so the user
// sees how the current selection maps to the operation before running it.
// Everything here is pure: the caller owns the cells; the panel commands in
// `core/commands` assemble and run.

import { PANE_BUFFERS, PANE_LABELS } from "./pane.js"
import { basename, parent } from "./path.js"
import { getOperations, pathToken } from "./operations.js"

// Constant: PANEL_FOCUS
// The two columns the panel's focus ring moves through: "ops" (the operation
// list, where typing filters) and "args" (an argument row, where Space toggles
// and a textual argument owns the keyboard).
const PANEL_FOCUS = { OPS: "ops", ARGS: "args" }

// Function: panelOperations
// The operations the panel lists: every visible registry entry that carries a
// structured `args` signature (the ones that take arguments).
function panelOperations() {
	return getOperations().filter((op) => !op.hidden && Array.isArray(op.args))
}

// Function: filterPanelOperations
// Narrows the operation list by a typed query: a case-insensitive match on the
// operation name, its alias(es), or its signature — so `edit` and `e` both find
// `edit PATH`. An empty query keeps every operation.
function filterPanelOperations(operations, query) {
	const q = `${query ?? ""}`.trim().toLowerCase()
	if (!q) return operations ?? []
	return (operations ?? []).filter((op) => {
		const names = [op.name, ...(op.aliases ?? [])]
		return names.some((name) => name.toLowerCase().includes(q)) || `${op.signature ?? ""}`.toLowerCase().includes(q)
	})
}

// Function: resolvePaneId
// Maps an argument role to a pane id: "source" -> SRC (left), "dest" -> DST
// (right), anything else -> the active pane.
function resolvePaneId(session, role) {
	if (role === "source") return "left"
	if (role === "dest") return "right"
	return session.active.value
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
		textual: arg.kind === "literal" || arg.kind === "raw" || arg.kind === "buffer",
	}
	if (arg.kind === "selection") {
		const paneId = resolvePaneId(session, role)
		const pane = session.panes[paneId]
		const entries = entryIndex(pane)
		return {
			...common,
			paneId,
			items: paneSelectionPaths(pane).map((path) => itemFor(entries, path)),
			value: "",
		}
	}
	if (arg.kind === "dest") {
		const pane = session.panes.right
		const path = pane?.path?.value ?? ""
		// The destination is editable in place, like a literal (no toggles).
		return { ...common, paneId: "right", textual: true, items: [], value: path }
	}
	if (arg.kind === "buffer") {
		return { ...common, items: [], value: `+${PANE_BUFFERS[session.active.value] ?? "A"}` }
	}
	return { ...common, items: [], value: "" }
}

// Function: bindArgs
// Binds every argument of `op` to the live context.
function bindArgs(session, op) {
	return (op?.args ?? []).map((arg, index) => bindArg(session, arg, index))
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

// Function: missingArg
// The name of the first argument that is not runnable: a required argument left
// blank, an optional one before a filled one (a positional gap would shift the
// following tokens), or a selection with nothing selected. Returns null when the
// argv is runnable.
function missingArg(bindings) {
	const list = bindings ?? []
	const args = argTokens(list)
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === "") return list[i].name
	}
	// A trailing required argument must still be filled.
	const trailing = list[list.length - 1]
	if (trailing && args[args.length - 1] === "" && trailing.optional !== true) return trailing.name
	return null
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
	if (binding.kind === "dest") return binding.value || "(none)"
	if (binding.kind === "buffer") return binding.value || "(active)"
	return binding.value ? binding.value : "(empty)"
}

// Function: panelRowList
// Flattens the draft into the rows the panel's argument column renders: one
// header row per argument, followed by one item row per item of a
// selection/destination argument (so individual paths can be toggled). Row
// focus is assigned by the view (comparing the row index to the cursor), the
// same way list rows are; this stays pure and index-stable.
function panelRowList(bindings) {
	const rows = []
	for (const binding of bindings ?? []) {
		rows.push({
			type: "arg",
			key: `arg:${binding.index}`,
			argIndex: binding.index,
			itemIndex: -1,
			name: binding.name,
			summary: panelSummary(binding),
			kind: binding.kind,
			role: binding.role,
			optional: binding.optional,
			variadic: binding.variadic,
			textual: binding.textual,
			value: binding.value,
			count: (binding.items ?? []).length,
		})
		for (let i = 0; i < (binding.items ?? []).length; i++) {
			const item = binding.items[i]
			const selected = item.selected
			rows.push({
				type: "item",
				key: `item:${binding.index}:${item.path}`,
				argIndex: binding.index,
				itemIndex: i,
				name: item.name,
				path: item.path,
				parent: item.parent ?? "",
				isDir: item.isDir,
				selected,
				marker: selected ? "[x]" : "[ ]",
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

// Function: isTextualRow
// True when the cursor row is an argument header that takes free text, so the
// panel focuses its edit field.
function isTextualRow(row) {
	return Boolean(row && row.type === "arg" && row.textual)
}

// Function: withToggledItem
// Returns a new draft with item `itemIndex` of argument `argIndex` toggled,
// leaving the other bindings untouched.
function withToggledItem(draft, argIndex, itemIndex) {
	return (draft ?? []).map((binding) => {
		if (binding.index !== argIndex) return binding
		const items = (binding.items ?? []).map((item, i) =>
			i === itemIndex ? { ...item, selected: !item.selected } : item,
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
	bindArgs,
	bindingAt,
	filterPanelOperations,
	isTextualRow,
	missingArg,
	panelCommand,
	panelOperations,
	panelRowList,
	panelRunnable,
	panelSummary,
	paneSelectionPaths,
	rowAt,
	selectedPaths,
	withArgValue,
	withToggledItem,
}
