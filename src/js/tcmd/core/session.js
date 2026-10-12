// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/session
// A Session wires two panes plus cross-pane UI state (active pane, preview,
// command panel, bookmarks) into one dispatchable model. Everything reactive
// is a cell or derived cell; views subscribe, commands mutate.

import { cell, derived, effect } from "select/state/cells"
import { createBookmarks } from "./bookmarks.js"
import { createDispatch, getAppCommands, getCommandBarItems } from "./commands.js"
import { createNullOs } from "./os.js"
import { PANEL_FOCUS, bindArgs, filterPanelEntries, isTextualRow, panelCommand, panelEntries, panelRowList, panelRunnable, rowAt, withArgValue } from "./panel.js"
import { basename, join } from "./path.js"
import { PANE_BUFFERS } from "./pane.js"
import { hasMatch, score } from "../vendor/fzy.js"

const PREVIEW_BYTES = 65536

// Function: createSession
// Creates the shared model for a two-pane browser.
//
// Example:
// ```javascript
// const session = createSession({ fs: createNodeFs(), left: pane, right: pane })
// await session.load()
// session.dispatch("pane.toggle")
// ```
function createSession({ fs, os, left, right, host, bookmarks } = {}) {
	const session = {}
	session.fs = fs
	session.os = os ?? createNullOs()
	session.panes = { left, right }
	// Shown in the header title; empty when the environment has no hostname.
	session.host = host ?? ""
	// Bookmark model (named paths). The store defaults to in-memory.
	session.bookmarks = bookmarks ?? createBookmarks()
	session.active = cell("left")
	// The active pane's current directory, tracked by the header title.
	session.activePath = derived([session.active, left.path, right.path], ([active, l, r]) =>
		active === "left" ? l : r,
	)
	session.showPreview = cell(true)
	session.notice = cell(null)
	session.confirm = cell(null)
	// The pane whose filter input currently owns the keyboard, or null.
	session.filtering = cell(null)

	// Bookmark overlay: `bookmarkMode` is "name" while recording (an input for
	// the new bookmark's name) or "list" while jumping (a fuzzy picker).
	session.bookmarkOpen = cell(false)
	session.bookmarkMode = cell("list")
	session.bookmarkQuery = cell("")
	session.bookmarkIndex = cell(0)
	// The path being recorded while in "name" mode.
	session.bookmarkTarget = cell(null)

	// Command panel (`:`): the one entry point, listing the CLI operations
	// first and the TinyCmd actions after, with the selected operation's
	// arguments bound from the live context. `panelQuery` filters the entry
	// list by typed name; `panelOpIndex` selects an entry in that filtered
	// list; `panelRowIndex` is the cursor in the flattened argument rows
	// (headers + items); `panelFocus` is a `PANEL_FOCUS` token ("ops": typing
	// filters entries, "args": an argument owns the keyboard). `panelDraft`
	// holds the transient bindings the user tweaks — it never mutates the real
	// pane marks.
	session.panelOpen = cell(false)
	session.panelQuery = cell("")
	session.panelOpIndex = cell(0)
	session.panelRowIndex = cell(0)
	session.panelFocus = cell(PANEL_FOCUS.OPS)
	session.panelDraft = cell([])
	session.panelEntries = cell(panelEntries(getAppCommands()))

	// The bookmark picker keeps its cursor on the first match whenever the
	// query changes.
	effect([session.bookmarkQuery], () => session.bookmarkIndex.set(0))

	// Filter editing is bound to the active pane: switching pane drops the
	// input so keystrokes never leak into another pane's filter.
	effect([session.active], () => session.filtering.set(null))

	// The entry under the cursor of each pane, as a small plain object. The
	// stat details (ctime, mode, uid, gid) come from the directory's lazy
	// `cursorStat`, so the pane detail line updates as the cursor moves.
	session.leftCursorEntry = derived([left.entries, left.cursor, left.cursorStat], ([entries, cursor, stat]) =>
		entrySummary(stat ?? entries[cursor]),
	)
	session.rightCursorEntry = derived([right.entries, right.cursor, right.cursorStat], ([entries, cursor, stat]) =>
		entrySummary(stat ?? entries[cursor]),
	)

	// Preview target: a `view`/`stat` pin, or the active pane's cursor entry.
	session.previewTarget = cell(null)
	session.previewEntry = derived(
		[session.active, session.leftCursorEntry, session.rightCursorEntry, session.previewTarget],
		([active, l, r, target]) => target ?? (active === "left" ? l : r),
	)

	// Moving either cursor resumes following the cursor in the preview.
	effect([session.leftCursorEntry, session.rightCursorEntry], () => session.previewTarget.set(null))

	session._previewToken = 0

	// Preview payload: text head for files, metadata for the rest; `stat`
	// targets carry `details` and render as a card even for directories.
	session.preview = cell(null)
	session._stopPreviewWatch = effect([session.previewEntry, session.showPreview], async ([entry, show]) => {
		if (!show || !entry) {
			session.preview.set(null)
			return
		}
		const kind = entry.isDir ? "directory" : previewKind(entry)
		if (entry.details) {
			session.preview.set({
				kind,
				title: basename(entry.path),
				size: entry.size,
				ext: entry.ext,
				details: entry.details,
				text: null,
			})
			return
		}
		if (entry.isDir) {
			session.preview.set(null)
			return
		}
		const token = ++session._previewToken
		const head =
			kind === "text" ? await fs.readTextHead(entry.path, PREVIEW_BYTES).catch(() => null) : null
		if (token !== session._previewToken) return
		session.preview.set({
			kind,
			title: basename(entry.path),
			size: entry.size,
			ext: entry.ext,
			text: head === null || hasBinaryByte(head) ? null : head,
		})
	})

	// Selection filesets: each pane's non-empty mark buffer ($A for the source
	// pane, $B for the destination), plus $FILE for the entry the preview is
	// following. These are the values scripting-mode completions offer.
	session.filesets = derived(
		[left.marked, right.marked, session.previewEntry],
		([leftMarks, rightMarks, previewEntry]) => {
			const sets = []
			if (leftMarks && leftMarks.size) {
				const label = PANE_BUFFERS.left
				sets.push({ id: `$${label}`, label, paths: [...leftMarks], count: leftMarks.size })
			}
			if (rightMarks && rightMarks.size) {
				const label = PANE_BUFFERS.right
				sets.push({ id: `$${label}`, label, paths: [...rightMarks], count: rightMarks.size })
			}
			if (previewEntry && !previewEntry.isDir) {
				sets.push({
					id: "$FILE",
					label: "FILE",
					paths: [previewEntry.path],
					count: 1,
				})
			}
			return sets
		},
	)

	// Bookmark picker rows: the bookmarks fuzzily matched by name or path,
	// ranked by fzy score. Only meaningful in "list" mode.
	session.bookmarkItems = derived(
		[session.bookmarks.entries, session.bookmarkQuery, session.bookmarkMode],
		([entries, query, mode]) => {
			if (mode !== "list") return []
			const rows = Object.entries(entries ?? {}).map(([name, entry]) => ({ name, ...entry }))
			const q = `${query ?? ""}`.trim()
			if (!q) return rows.sort((a, b) => a.name.localeCompare(b.name))
			const ranked = []
			for (const row of rows) {
				const best = Math.max(
					hasMatch(q, row.name) ? score(q, row.name) : -Infinity,
					hasMatch(q, row.path) ? score(q, row.path) : -Infinity,
				)
				if (best > -Infinity) ranked.push({ row, score: best })
			}
			ranked.sort((a, b) => (a.score !== b.score ? b.score - a.score : a.row.name.localeCompare(b.row.name)))
			return ranked.map((match) => match.row)
		},
	)

	// Command bar rows: context-dependent key hints (see core/commands). The
	// panel button is dropped when a host disables the panel.
	session.commandBarItems = derived(
		[session.filtering, session.bookmarkOpen, session.bookmarkMode, session.panelOpen],
		([filtering, bookmarkOpen, bookmarkMode, panelOpen]) =>
			getCommandBarItems({ filtering, bookmarkOpen, bookmarkMode, panelOpen }),
	)

	// The entry list filtered by the typed query; `panelOpIndex` indexes into
	// this filtered list.
	session.panelFiltered = derived(
		[session.panelEntries, session.panelQuery],
		([entries, query]) => filterPanelEntries(entries, query),
	)
	// The entry the command panel is editing, and its bound arguments.
	session.panelEntry = derived(
		[session.panelFiltered, session.panelOpIndex],
		([entries, index]) => entries[Math.max(0, Math.min(index, entries.length - 1))] ?? null,
	)
	session.panelRows = derived([session.panelDraft], ([draft]) => panelRowList(draft))
	// The assembled command line the draft maps to, and whether it is runnable.
	// The preview answers "what will this run" as the shell would see it,
	// prefixed with the entry name; a `«NAME»` marks a required argument still
	// to fill. A TinyCmd action has no arguments, so it previews as its title.
	session.panelCommand = derived(
		[session.panelDraft, session.panelEntry],
		([draft, entry]) => {
			const args = panelCommand(draft)
			const name = entry?.name ?? ""
			return args ? `${name} ${args}` : name
		},
	)
	session.panelRunnable = derived([session.panelDraft], ([draft]) => panelRunnable(draft))
	// The cursor row and whether it is a textual argument (so the panel focuses
	// its text field).
	session.panelCursorRow = derived(
		[session.panelRows, session.panelRowIndex],
		([rows, row]) => rowAt(rows, row),
	)
	session.panelTextual = derived([session.panelCursorRow], ([row]) => isTextualRow(row))
	// The text the input edits. A plain cell (the input writes through it); an
	// effect copies the focused binding's value in whenever the cursor lands on
	// a textual argument, and another folds typing back into the transient
	// draft so a value survives moving to another argument.
	session.panelValue = cell("")
	effect([session.panelCursorRow], ([row]) => {
		if (isTextualRow(row)) session.panelValue.set(`${row.value ?? ""}`)
	})
	effect([session.panelValue], ([value]) => {
		const row = session.panelCursorRow.value
		if (isTextualRow(row)) {
			session.panelDraft.set(withArgValue(session.panelDraft.value, row.argIndex, value))
		}
	})

	// A picker-row projection for the entry list (left column), over the
	// query-filtered entries. `summary` is the argument list a CLI operation
	// shows — its signature with the leading name stripped — or the key
	// shortcut of a TinyCmd action; `source` is the namespace marker the row
	// renders.
	session.panelItems = derived([session.panelFiltered], ([entries]) =>
		entries.map((entry) => ({
			id: entry.id,
			name: entry.name,
			summary: entry.summary,
			risk: entry.risk,
			source: entry.source,
		})),
	)

	// Re-bind the panel draft when the panel opens or the selected entry
	// changes. The panel is modal, so the pane context does not change
	// underneath it; opening the panel owns the draft while it is open.
	effect([session.panelOpen, session.panelEntry], ([open, entry]) => {
		if (!open) return
		session.panelDraft.set(bindArgs(session, entry))
	})
	// Selecting another entry resets the argument cursor.
	effect([session.panelEntry], () => {
		session.panelRowIndex.set(0)
	})
	// Typing a query re-anchors the entry cursor on the first match.
	effect([session.panelQuery], () => {
		session.panelOpIndex.set(0)
	})

	session.dispatch = createDispatch(session)
	session.load = () => load(session)
	return session
}

// Function: load
// Reads the initial listing for both panes and the persisted bookmarks.
async function load(session) {
	await Promise.all([
		session.panes.left.refresh(),
		session.panes.right.refresh(),
		session.bookmarks.load?.(),
	])
}

function entrySummary(entry) {
	if (!entry) return null
	return {
		name: entry.name,
		path: entry.path,
		isDir: entry.isDir,
		isSymlink: entry.isSymlink,
		isDevice: entry.isDevice,
		size: entry.size,
		mtimeMs: entry.mtimeMs,
		ctimeMs: entry.ctimeMs,
		mode: entry.mode,
		uid: entry.uid,
		gid: entry.gid,
		owner: entry.owner,
		ext: entry.ext,
	}
}

// Function: previewKind
// Preview classification for file entries; directories are not previewed.
function previewKind(entry) {
	const image = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]
	const media = ["mp3", "wav", "ogg", "flac", "mp4", "webm", "mkv", "mov", "pdf"]
	if (entry.ext && image.includes(entry.ext)) return "image"
	if (entry.ext && media.includes(entry.ext)) return "media"
	return "text"
}

function hasBinaryByte(text) {
	for (let i = 0; i < 2048 && i < text.length; i++) {
		const code = text.charCodeAt(i)
		if (code < 9 || (code > 13 && code < 32)) return true
	}
	return false
}

export { createSession, load }
