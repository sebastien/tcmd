// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/session
// A Session wires two panes plus cross-pane UI state (active pane, preview,
// command palette, bookmarks) into one dispatchable model. Everything reactive
// is a cell or derived cell; views subscribe, commands mutate.

import { cell, derived, effect } from "select/state/cells"
import { createBookmarks } from "./bookmarks.js"
import { commandRow, createDispatch, getCommandBarItems, getPaletteCommands } from "./commands.js"
import { createNullOs } from "./os.js"
import { basename, join } from "./path.js"
import { PANE_BUFFERS } from "./pane.js"
import { completionToken, scriptItems } from "./script.js"
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
	session.paletteOpen = cell(false)
	session.paletteMode = cell("ui")
	session.paletteQuery = cell("")
	session.paletteIndex = cell(0)
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

	// The command palette keeps its cursor on the first match whenever the
	// query changes.
	effect([session.paletteQuery], () => session.paletteIndex.set(0))
	// The bookmark picker likewise.
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

	// The active pane's entries, used for script path completion.
	session.activeEntries = derived(
		[session.active, left.entries, right.entries],
		([active, l, r]) => (active === "left" ? l : r),
	)

	// Script path completion: the entries of the directory being typed (a
	// token containing "/"), or the active pane's entries otherwise.
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
			const base = session.panes[active]?.path.value ?? session.fs.cwd()
			const dir = token.dir.startsWith("/") ? token.dir : join(base, token.dir)
			const mine = ++session._completionToken
			const entries = await session.fs.readDir(dir).catch(() => [])
			if (mine !== session._completionToken) return
			session.completionEntries.set(entries)
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

	// Command bar rows: context-dependent key hints (see core/commands).
	session.commandBarItems = derived(
		[session.paletteOpen, session.paletteMode, session.filtering, session.bookmarkOpen, session.bookmarkMode],
		([open, mode, filtering, bookmarkOpen, bookmarkMode]) =>
			getCommandBarItems(open, mode, filtering, bookmarkOpen, bookmarkMode),
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
