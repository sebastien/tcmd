// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/session
// A Session wires two panes plus cross-pane UI state (active pane, preview,
// command palette) into one dispatchable model. Everything reactive is a cell
// or derived cell; views subscribe, commands mutate.

import { cell, derived, effect } from "select/state/cells"
import { commandRow, createDispatch, getCommandBarItems, getPaletteCommands } from "./commands.js"
import { createNullOs } from "./os.js"
import { basename, join } from "./path.js"
import { completionToken, scriptItems } from "./script.js"
import { createLabels } from "./tab.js"

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
function createSession({ fs, os, left, right, host }) {
	const session = {}
	session.fs = fs
	session.os = os ?? createNullOs()
	session.panes = { left, right }
	// Shown in the header title; empty when the environment has no hostname.
	session.host = host ?? ""
	// One label allocator for both panes: tab A is the left pane's first tab,
	// tab B the right pane's first tab, and so on (see core/tab).
	const labels = createLabels()
	for (const pane of [left, right]) pane.useLabels?.(labels)
	session.active = cell("left")
	// The active pane's current directory, tracked by the header title.
	session.activePath = derived([session.active, left.path, right.path], ([active, l, r]) =>
		active === "left" ? l : r,
	)
	session.showPreview = cell(true)
	session.paletteOpen = cell(false)
	session.paletteMode = cell("ui")
	session.paletteQuery = cell("")
	session.paletteIndex = cell(0)
	session.notice = cell(null)
	session.confirm = cell(null)
	// The pane whose filter input currently owns the keyboard, or null.
	session.filtering = cell(null)

	// The command palette keeps its cursor on the first match whenever the
	// query changes.
	effect([session.paletteQuery], () => session.paletteIndex.set(0))

	// Filter editing is bound to the active tab: switching pane or tab drops
	// the input so keystrokes never leak into another pane's filter.
	effect([session.active, left.activeIndex, right.activeIndex], () => session.filtering.set(null))

	// The entry under the cursor of each pane, as a small plain object.
	session.leftCursorEntry = derived([left.entries, left.cursor], ([entries, cursor]) =>
		entrySummary(entries[cursor]),
	)
	session.rightCursorEntry = derived([right.entries, right.cursor], ([entries, cursor]) =>
		entrySummary(entries[cursor]),
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

	// Selection filesets: every non-empty tab buffer named by its label
	// ($A, $B, …), plus $FILE for the entry the preview is following. These
	// are the values scripting-mode completions offer (see core/script).
	session.filesets = derived(
		[left.tabs, left.marks, right.tabs, right.marks, session.previewEntry],
		([leftTabs, leftMarks, rightTabs, rightMarks, previewEntry]) => {
			const sets = []
			collectFilesets(sets, leftTabs, leftMarks)
			collectFilesets(sets, rightTabs, rightMarks)
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

	// The active pane's entries, used for script path completion.
	session.activeEntries = derived(
		[session.active, left.entries, right.entries],
		([active, l, r]) => (active === "left" ? l : r),
	)

	// Script path completion: the entries of the directory being typed (a
	// token containing "/"), or the active tab's entries otherwise.
	session.completionEntries = cell([])
	session._completionToken = 0
	effect(
		[session.paletteMode, session.paletteQuery, session.activeEntries, session.active],
		async ([mode, query, activeEntries, active]) => {
			if (mode !== "script") {
				session.completionEntries.set([])
				return
			}
			const token = completionToken(query)
			if (!token) {
				session.completionEntries.set(activeEntries ?? [])
				return
			}
			const base = session.panes[active]?.current()?.path.value ?? session.fs.cwd()
			const dir = token.dir.startsWith("/") ? token.dir : join(base, token.dir)
			const mine = ++session._completionToken
			const entries = await session.fs.readDir(dir).catch(() => [])
			if (mine !== session._completionToken) return
			session.completionEntries.set(entries)
		},
	)

	// Command bar rows: context-dependent key hints (see core/commands).
	session.commandBarItems = derived(
		[session.paletteOpen, session.paletteMode, session.filtering],
		([open, mode, filtering]) => getCommandBarItems(open, mode, filtering),
	)

	// Command palette rows: UI actions by default; in scripting mode, the
	// operations plus the available filesets. Both are filtered by the query.
	session.paletteCommands = cell(getPaletteCommands().map(commandRow))
	session.paletteItems = derived(
		[
			session.paletteMode,
			session.paletteQuery,
			session.paletteCommands,
			session.filesets,
			session.completionEntries,
		],
		([mode, query, commands, filesets, entries]) =>
			mode === "script"
				? scriptItems(query, filesets, { entries })
				: filterCommandRows(commands, query),
	)

	session.dispatch = createDispatch(session)
	session.load = () => load(session)
	return session
}

// Function: load
// Reads the initial listing for both panes.
async function load(session) {
	await Promise.all([session.panes.left.refresh(), session.panes.right.refresh()])
}

function entrySummary(entry) {
	if (!entry) return null
	return { name: entry.name, path: entry.path, isDir: entry.isDir, size: entry.size, ext: entry.ext }
}

// Function: collectFilesets
// Appends one `$LABEL` fileset per tab whose marks are non-empty, ordered by
// label (A, B, …, Z, A1, …).
function collectFilesets(sets, tabs, marks) {
	const rows = []
	for (const tab of tabs) {
		const paths = marks?.[tab.id]
		if (paths && paths.size) {
			rows.push({ id: `$${tab.label}`, label: tab.label, paths: [...paths], count: paths.size })
		}
	}
	rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
	sets.push(...rows)
}

// Function: filterCommandRows
// Case-insensitive title filter; an empty query keeps every row.
function filterCommandRows(rows, query) {
	const q = `${query ?? ""}`.trim().toLowerCase()
	if (!q) return rows
	return rows.filter((row) => row.title.toLowerCase().includes(q))
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

// EOF
