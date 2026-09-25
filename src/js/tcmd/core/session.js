// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/session
// A Session wires two panes plus cross-pane UI state (active pane, preview,
// command palette) into one dispatchable model. Everything reactive is a cell
// or derived cell; views subscribe, commands mutate.

import { cell, derived, effect } from "select/state/cells"
import { createDispatch, getCommands } from "./commands.js"
import { basename } from "./path.js"

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
function createSession({ fs, left, right }) {
	const session = {}
	session.fs = fs
	session.panes = { left, right }
	session.active = cell("left")
	session.showPreview = cell(true)
	session.paletteOpen = cell(false)
	session.paletteQuery = cell("")
	session.paletteIndex = cell(0)

	// The entry under the cursor of each pane, as a small plain object.
	session.leftCursorEntry = derived([left.entries, left.cursor], ([entries, cursor]) =>
		entrySummary(entries[cursor]),
	)
	session.rightCursorEntry = derived([right.entries, right.cursor], ([entries, cursor]) =>
		entrySummary(entries[cursor]),
	)

	// Preview target: the active pane's cursor entry (or null).
	session.previewEntry = derived(
		[session.active, session.leftCursorEntry, session.rightCursorEntry],
		([active, l, r]) => (active === "left" ? l : r),
	)

	session._previewToken = 0

	// Preview payload: text head for files, metadata for the rest.
	session.preview = cell(null)
	session._stopPreviewWatch = effect([session.previewEntry, session.showPreview], async ([entry, show]) => {
		if (!show || !entry || entry.isDir) {
			session.preview.set(null)
			return
		}
		const token = ++session._previewToken
		const kind = previewKind(entry)
		const head =
			kind === "text" ? await fs.readTextHead(entry.path, PREVIEW_BYTES).catch(() => null) : null
		if (token !== session._previewToken) return
		session.preview.set({
			kind,
			title: basename(entry.path),
			size: entry.size,
			text: head === null || hasBinaryByte(head) ? null : head,
		})
	})
	session._previewToken = 0

	// Toolbar/palette rows: only commands flagged for the toolbar.
	session.commandsCell = cell(
		getCommands()
			.filter((command) => command.toolbar)
			.map((command) => ({ id: command.id, title: command.title, keys: command.keys })),
	)

	// Command palette rows filtered by the current query.
	session.paletteItems = derived([session.paletteQuery, session.commandsCell], ([query, all]) => {
		const q = `${query ?? ""}`.trim().toLowerCase()
		if (!q) return all
		return all.filter((command) => command.title.toLowerCase().includes(q))
	})

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

function previewKind(entry) {
	if (entry.isDir) return "dir"
	const image = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]
	const media = ["mp3", "wav", "ogg", "flac", "mp4", "webm", "mkv", "mov", "pdf"]
	if (entry.ext && image.includes(entry.ext)) return "image"
	if (entry.ext && media.includes(entry.ext)) return "media"
	return "text"
}

function hasBinaryByte(text) {
	for (let i = 0; i < 2048 && i < text.length; i++) {
		const code = text.charCodeAt(i)
		if (code === 0 || (code < 9 && code !== 0) || (code > 13 && code < 32)) return true
	}
	return false
}

export { createSession, load }

// EOF
