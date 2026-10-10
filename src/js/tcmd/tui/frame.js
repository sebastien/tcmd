// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-02

// Module: tcmd/tui/frame
// TUI-only presentation behaviors for the workspace chrome: the frame border
// (identity + host), the responsive breakpoints driven by the `uiSize` cell,
// the pane borders, header rules and the help overlay state. Everything here
// is injected into the App binding; none of it lives in the shared
// `components/` logic.

import { unwrap } from "select/state/cells"
import { DEFAULT_KEYMAP } from "../core/keymap.js"
import { getCommands } from "../core/commands.js"
import { formatTitle } from "../components/format.js"

// Below this the two-pane workspace is replaced by a resize hint.
const MIN_WIDTH = 64
const MIN_HEIGHT = 16
// At or above this the inspector can sit beside the panes; below it becomes a
// fullscreen overlay.
const INSPECTOR_INLINE_WIDTH = 100
// Below this the command bar keeps only its essential hints; the rest stay
// reachable from the palette and the `?` reference.
const BAR_COMPACT_WIDTH = 110

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

// Function: paneListHeight
// Rows available to a pane's listing: the viewport height minus the frame
// border (2), the pane's own border (2), the pane header + rule (2), the entry
// detail (2) and the summary + command bar (1 each) — ten chrome rows in all,
// matching the App layout. Fed to the windowed `filelist` so a large directory
// mounts only the visible slice. `0` means "unknown — render everything to
// measure". Pinned by the golden frame tests (visible rows = height - 10).
function paneListHeight(data, self) {
	const size = sizeOf(data, self)
	const height = Math.floor(size?.height ?? 0)
	if (height <= 0) return 0
	return Math.max(1, height - 10)
}

// Function: createFrameBehaviors
// Behaviors for the App root and its chrome.
function createFrameBehaviors(env) {
	return {
		// Identity line in the top border: "TinyCmd - host /path", compressed
		// to the viewport width.
		frameTitle: (self, data) => {
			const width = sizeOf(data, self)?.width ?? 0
			return ` ${formatTitle(unwrap(data.appHost), unwrap(data.appPath), Math.max(0, width - 4))} `
		},
		frameBorderFg: () => env.theme.borderPrimaryFg,
		frameTitleFg: () => env.theme.textHeadingFg,

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

export { BAR_COMPACT_WIDTH, createFrameBehaviors, helpLines, INSPECTOR_INLINE_WIDTH, isNarrow, keyGlyph }

// EOF
