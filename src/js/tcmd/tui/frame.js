// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-02

// Module: tcmd/tui/frame
// TUI-only presentation behaviors for the workspace chrome: the responsive
// breakpoints driven by the `uiSize` cell, the pane borders, header rules,
// the command-bar geometry and the help overlay state. Everything here is
// injected into the App binding; none of it lives in the shared
// `components/` logic.

import { unwrap } from "select/state/cells"
import { DEFAULT_KEYMAP } from "../core/keymap.js"
import { getCommands } from "../core/commands.js"
import { commandBarMarksItem, commandBarRowCount, commandBarStatus } from "../components/CommandBar.js"

// Below this the two-pane workspace is replaced by a resize hint.
const MIN_WIDTH = 64
const MIN_HEIGHT = 16
// At or above this the inspector can sit beside the panes; below it becomes a
// fullscreen overlay.
const INSPECTOR_INLINE_WIDTH = 100

// Function: sizeOf
// Reads the viewport size from the App data, falling back to the renderer's
// own dimensions so the gates work even when no `uiSize` cell is injected
// (tests, web). Returns `null` when neither is known.
function sizeOf(data, self) {
	const size = unwrap(data?.uiSize)
	if (size && (size.width || size.height)) return size
	const width = Math.floor(self?.ctx?.width ?? 0)
	const height = Math.floor(self?.ctx?.height ?? 0)
	if (!width && !height) return null
	return { width, height }
}

// Function: isNarrow
// True when the viewport is known and too narrow for the inline inspector.
function isNarrow(data, self) {
	const size = sizeOf(data, self)
	return Boolean(size && (size.width ?? 0) > 0 && size.width < INSPECTOR_INLINE_WIDTH)
}

// Function: commandBarRowsFor
// The entries the bar currently shows: the context hints or the `bar`
// commands, plus the active pane's marked count as a trailing entry.
function commandBarRowsFor(data) {
	const items = unwrap(data?.commandBarItems) ?? []
	const marks = commandBarMarksItem(data)
	return marks ? [...items, marks] : items
}

// Function: commandBarLines
// Rows the wrapped command bar occupies at the current viewport (the bar
// is inset one column from the viewport edge).
function commandBarLines(data, self) {
	const width = Math.floor(sizeOf(data, self)?.width ?? 0)
	if (width <= 0) return 1
	return commandBarRowCount(commandBarRowsFor(data), width - 1)
}

// Function: paneListHeight
// Rows available to a pane's listing: the viewport height minus the identity
// bar (1), the pane's own border (2), the pane header + rule (2), the entry
// detail (2), the summary (1) and the wrapped command bar — eight chrome rows
// plus the bar. Fed to the windowed `filelist` so a large directory mounts
// only the visible slice. `0` means "unknown — render everything to measure".
function paneListHeight(data, self) {
	const height = Math.floor(sizeOf(data, self)?.height ?? 0)
	if (height <= 0) return 0
	// A notice or error swaps the keys for a one-line status.
	const bar = commandBarStatus(data) ? 1 : commandBarLines(data, self)
	return Math.max(1, height - 8 - bar)
}

// Function: createFrameBehaviors
// Behaviors for the App root and its chrome.
function createFrameBehaviors(env) {
	return {
		// Identity bar: "TinyCmd - host", or just "TinyCmd" without a host.
		// Everything else on screen belongs to the user's files; this one row
		// is the app's own.
		topBar: (_self, data) => {
			const host = `${unwrap(data.appHost) ?? ""}`.trim()
			return host ? ` TinyCmd - ${host} ` : " TinyCmd "
		},
		topBarFg: () => env.theme.textHeadingFg,

		// Responsive gates. `uiSize` is absent in tests and the web, so the
		// workspace renders normally there.
		tooSmall: (self, data) => {
			const size = sizeOf(data, self)
			if (!size) return false
			return (size.width ?? MIN_WIDTH) < MIN_WIDTH || (size.height ?? MIN_HEIGHT) < MIN_HEIGHT
		},
		minSizeTitle: () => "Terminal too small",
		minSizeHint: (self, data) => {
			const size = sizeOf(data, self) ?? { width: 0, height: 0 }
			return `need ${MIN_WIDTH}x${MIN_HEIGHT}, have ${size.width ?? 0}x${size.height ?? 0}`
		},
		// The min-size gate text uses the heading/secondary text tokens.
		titleFg: () => env.theme.textHeadingFg,
		dimFg: () => env.theme.textSecondaryFg,

		// Each pane is a complete box. Both draw all four edges (the middle
		// shows two adjacent rules) so each pane's border colour can track its
		// own focus independently — a shared edge would be owned by one pane
		// and never highlight when the other is active.
		leftBorder: () => ["top", "left", "bottom", "right"],
		rightBorder: () => ["top", "left", "bottom", "right"],
		// The header rule separates the pane header row from the listing body.
		headRule: () => ["top"],

		// The breadcrumb yields the pane header row to the filter while a
		// filter is being edited or applied.
		leftFilterOn: (_self, data) => Boolean(unwrap(data.leftFilter)),
		rightFilterOn: (_self, data) => Boolean(unwrap(data.rightFilter)),

		// The inline inspector shows when the preview is on and the viewport is
		// wide enough; otherwise `v` opens the fullscreen viewer.
		inspectorNarrow: (self, data) => isNarrow(data, self),
		showInspectorInline: (self, data) => Boolean(unwrap(data.showPreview)) && !isNarrow(data, self),
		showViewer: (self, data) => Boolean(unwrap(data.viewerOpen)) && isNarrow(data, self),

		// Help overlay visibility; the content lives in `tui/Help.js` so the
		// overlay has a single source of truth.
		helpOpen: (_self, data) => Boolean(unwrap(data.helpOpen)),

		// The windowed listing height for both panes (they share the row).
		listViewport: (self, data) => paneListHeight(data, self),

		// The command bar's height: one line for a status, otherwise as many
		// rows as the wrapped bracket shorthands need.
		barHeight: (self, data) => (commandBarStatus(data) ? 1 : commandBarLines(data, self)),
	}
}

// Function: keyGlyph
// Human-readable glyph for a keymap chord ("↑", "⇧Tab", "^W", "PgUp").
function keyGlyph(chord) {
	const name = chord.key
	const named = {
		up: "↑",
		down: "↓",
		left: "←",
		right: "→",
		return: "↵",
		enter: "↵",
		space: "Space",
		tab: "Tab",
		pageup: "PgUp",
		pagedown: "PgDn",
		escape: "Esc",
		backspace: "Bksp",
		home: "Home",
		end: "End",
	}
	let base = named[name] ?? (name.length === 1 ? name.toUpperCase() : `${name}`)
	if (chord.ctrl) base = `^${base}`
	if (chord.meta) base = `⌘${base}`
	if (chord.shift && name !== "tab") base = `⇧${base}`
	return base
}

// Constant: GROUP_ORDER / GROUP_TITLES
// Help sections, in display order.
const GROUP_ORDER = ["nav", "pane", "list", "bookmark", "view", "file", "panel", "palette", "filter", "app"]
const GROUP_TITLES = {
	app: "Session",
	bookmark: "Bookmarks",
	file: "Files",
	filter: "Filter",
	list: "Selection",
	nav: "Navigation",
	palette: "Commands",
	panel: "Command panel",
	pane: "Panes",
	view: "View",
}

// Function: helpLines
// Builds the categorized key reference from the keymap and the command
// registry, so it can never drift from the actual bindings.
function helpLines() {
	const byId = new Map(getCommands().map((command) => [command.id, command]))
	const groups = new Map()
	const seen = new Set()
	for (const binding of DEFAULT_KEYMAP) {
		const command = byId.get(binding.command)
		if (!command) continue
		const group = binding.command.split(".")[0]
		if (!groups.has(group)) groups.set(group, new Map())
		const rows = groups.get(group)
		if (!rows.has(binding.command)) rows.set(binding.command, { keys: [], title: command.title })
		const row = rows.get(binding.command)
		const glyph = keyGlyph(binding)
		if (!row.keys.includes(glyph) && !seen.has(`${binding.command}:${glyph}`)) {
			row.keys.push(glyph)
			seen.add(`${binding.command}:${glyph}`)
		}
	}
	const lines = []
	for (const group of GROUP_ORDER) {
		const rows = groups.get(group)
		if (!rows) continue
		lines.push(GROUP_TITLES[group] ?? group)
		for (const row of rows.values()) {
			lines.push(`  ${row.keys.join("/").padEnd(9)} ${row.title}`)
		}
		lines.push("")
	}
	return lines
}

export {
	commandBarLines,
	createFrameBehaviors,
	helpLines,
	INSPECTOR_INLINE_WIDTH,
	isNarrow,
	keyGlyph,
	sizeOf,
}
// EOF
