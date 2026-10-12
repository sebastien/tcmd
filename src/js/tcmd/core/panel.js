// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/core/panel
// The command panel (Commando): the one entry point for everything the
// application can do. It lists two namespaces in one column, marked apart so
// they can be told at a glance — CLI operations (`copy`, `delete`, `run`, the
// `core/operations` registry) first, then the TinyCmd actions (`Open file`,
// `Bookmark`, `Preview`, the `core/commands` registry). Both are ranked by
// match importance once a query filters them (see `filterPanelEntries`).
//
// For the selected CLI operation, the panel binds its arguments from the live
// context — a selection argument shows the SRC/DST pane's marked paths (falling
// back to the cursor entry) and lets the user toggle individual items; a
// destination argument resolves to the DST pane's directory; textual arguments
// (a name, a buffer label, a shell command) are typed in place. A TinyCmd
// action takes no arguments, so its draft is empty and Enter just dispatches
// it.
//
// The selection the user tweaks is *transient*: it lives in the draft bindings
// (`session.panelDraft`), never in the real pane marks. When the draft runs,
// each selection argument is encoded as a self-contained `$paths:[…]` token, so
// the resolved paths survive an async confirm (see `expandArg`). The same draft
// assembles the command line the panel previews (`panelCommand`), so the user
// sees how the current selection maps to the operation before running it.
// Everything here is pure: the caller owns the cells; the panel commands in
// `core/commands` assemble and run.

import { hasMatch, score } from "../vendor/fzy.js"
import { PANE_BUFFERS, PANE_LABELS } from "./pane.js"
import { basename, parent } from "./path.js"
import { getOperations, pathToken } from "./operations.js"

// Constant: PANEL_FOCUS
// The two columns the panel's focus ring moves through: "ops" (the entry list,
// where typing filters) and "args" (an argument row, where Space toggles and a
// textual argument owns the keyboard).
const PANEL_FOCUS = { OPS: "ops", ARGS: "args" }

// Constant: PANEL_SOURCES
// The two namespaces the panel lists, in display order: the CLI operations,
// then the TinyCmd actions.
const PANEL_SOURCES = ["cli", "app"]

// Constant: PANEL_NOISE
// Action ids the panel never lists: raw cursor movement already lives on the
// arrow keys and would only be noise.
const PANEL_NOISE = /^nav\./

// Function: panelCliEntries
// One panel entry per visible CLI operation.
function panelCliEntries() {
	return getOperations()
		.filter((op) => !op.hidden)
		.map((op) => ({
			source: "cli",
			id: `op:${op.name}`,
			name: op.name,
			summary: `${op.signature ?? ""}`.replace(/^\S+\s*/, ""),
			signature: op.signature ?? "",
			risk: op.risk ?? null,
			matchNames: [op.name, ...(op.aliases ?? [])],
			op,
		}))
}

// Function: panelAppEntries
// One panel entry per TinyCmd action. Their id doubles as a search term, so
// `file.` finds `file.open` as well as `Open file` does.
function panelAppEntries(commands) {
	return (commands ?? [])
		.filter((command) => !PANEL_NOISE.test(command.id))
		.map((command) => ({
			source: "app",
			id: `cmd:${command.id}`,
			name: command.title ?? command.id,
			summary: command.keys ? `[${command.keys}]` : "",
			signature: "",
			risk: null,
			matchNames: [command.title ?? command.id, command.id],
			command,
		}))
}

// Function: panelEntries
// The entries the panel lists: the CLI operations, then the TinyCmd actions
// (the `core/commands` registry rows, passed in so this module stays free of a
// dependency on it).
function panelEntries(commands) {
	return [...panelCliEntries(), ...panelAppEntries(commands)]
}

// Function: compareEntries
// The panel's default ordering: within a namespace alphabetically by name,
// CLI operations before TinyCmd actions.
function compareEntries(a, b) {
	const bySource = PANEL_SOURCES.indexOf(a?.source) - PANEL_SOURCES.indexOf(b?.source)
	if (bySource !== 0) return bySource
	return `${a?.name ?? ""}`.localeCompare(`${b?.name ?? ""}`)
}

// Function: entryScore
// The match importance of an entry for a query: the best fzy score across its
// names, or `-Infinity` when none matches (only the signature does).
function entryScore(entry, query) {
	let best = -Infinity
	for (const name of entry.matchNames ?? []) {
		const haystack = `${name}`.toLowerCase()
		if (hasMatch(query, haystack)) best = Math.max(best, score(query, haystack))
	}
	return best
}

// Function: filterPanelEntries
// Narrows the entry list by a typed query and orders it: no query lists the
// CLI operations alphabetically, then the TinyCmd actions alphabetically; a
// query ranks the matches by importance (the fzy score of the best name match,
// so `open` outranks `copy` for `op`), ties keeping CLI before TinyCmd and then
// alphabetical. A query that only matches an operation's signature (`buf` ->
// `sel [+|-][BUF] PATH...`) keeps it listable, at the bottom.
function filterPanelEntries(entries, query) {
	const list = entries ?? []
	const q = `${query ?? ""}`.trim().toLowerCase()
	if (!q) return [...list].sort(compareEntries)
	const ranked = []
	for (const entry of list) {
		const rank = entryScore(entry, q)
		const signatureMatch = `${entry.signature ?? ""}`.toLowerCase().includes(q)
		if (rank === -Infinity && !signatureMatch) continue
		ranked.push({ entry, score: rank })
	}
	ranked.sort((a, b) => (a.score !== b.score ? b.score - a.score : compareEntries(a.entry, b.entry)))
	return ranked.map((match) => match.entry)
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
// Binds every argument of the selected entry to the live context. Only a CLI
// operation carries an `args` signature, so a TinyCmd action yields an empty
// draft.
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
	PANEL_SOURCES,
	argvFor,
	bindArgs,
	bindingAt,
	filterPanelEntries,
	isTextualRow,
	missingArg,
	panelCommand,
	panelEntries,
	panelRowList,
	panelRunnable,
	panelSummary,
	paneSelectionPaths,
	rowAt,
	selectedPaths,
	withArgValue,
	withToggledItem,
}
