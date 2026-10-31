// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-11-01

// Module: tcmd/core/bar
// Command-bar composition: turns the current context — the modal that owns
// the keyboard, the full preview mode, the focused workspace column — into the
// rows the bottom bar renders. Kept out of `core/commands`, whose domain is
// the command registry: a key and its bar entry are edited together here, and
// `barCommand` resolves ids through that registry.
//
// The precedence mirrors `components/App#createBehaviors` (the key router):
// viewer, confirm, panel/picker, bookmarks, the list overlay, the pane filter,
// then the maximized preview, then the workspace. A row with an `id` is
// clickable and dispatches that command; a row without one is a key hint.

import { getCommand } from "./commands.js"

// Constant: FILTER_KEYS
// Command-bar hints shown while a pane filter is capturing input.
const FILTER_KEYS = [
	{ id: null, title: "Navigate", keys: "↑/↓" },
	{ id: null, title: "Done", keys: "Enter", primary: true },
	{ id: null, title: "Clear", keys: "Esc" },
]

// Constant: BOOKMARK_KEYS
// Command-bar hints while the bookmarks panel owns the keyboard.
const BOOKMARK_KEYS = [
	{ id: null, title: "Navigate", keys: "↑/↓" },
	{ id: null, title: "Remove", keys: "⌫/Del" },
	{ id: null, title: "Open", keys: "Enter", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

// Constant: PANEL_HINT_KEYS
// Command-bar hints while the command panel is open.
const PANEL_HINT_KEYS = [
	{ id: null, title: "Command", keys: "↑/↓" },
	{ id: null, title: "Arg", keys: "⇥" },
	{ id: null, title: "Browse", keys: "^O" },
	{ id: null, title: "Toggle", keys: "Spc" },
	{ id: null, title: "Run", keys: "↵", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

// Constant: PANEL_CONFIRM_KEYS
// The same hints after a risky action is armed: Enter now confirms.
const PANEL_CONFIRM_KEYS = PANEL_HINT_KEYS.map((hint) =>
	hint.title === "Run" ? { ...hint, title: "Confirm" } : hint,
)

// Constant: PICKER_KEYS
// Command-bar hints while the panel's file picker owns the keyboard.
const PICKER_KEYS = [
	{ id: null, title: "Path", keys: "type" },
	{ id: null, title: "Row", keys: "↑/↓" },
	{ id: null, title: "Open", keys: "→" },
	{ id: null, title: "Go", keys: "↵", primary: true },
	{ id: null, title: "Here", keys: "^↵" },
	{ id: null, title: "Focus", keys: "⇥" },
	{ id: null, title: "Back", keys: "Esc" },
]

// Constant: HISTORY_KEYS / TRASH_KEYS
// Command-bar hints while the shared list overlay owns the keyboard.
const HISTORY_KEYS = [
	{ id: null, title: "Row", keys: "↑/↓" },
	{ id: null, title: "Jump", keys: "↵", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

const TRASH_KEYS = [
	{ id: null, title: "Row", keys: "↑/↓" },
	{ id: null, title: "Restore", keys: "↵", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

// Constant: CONFIRM_KEYS
// Command-bar hints while a confirmation dialog owns the keyboard.
const CONFIRM_KEYS = [
	{ id: null, title: "Yes", keys: "y", primary: true },
	{ id: null, title: "No", keys: "n" },
]

// Function: getCommandBarItems
// Command-bar rows for the current context, in the same precedence as the key
// handler. Takes the context as named fields — adjacent flags are too easy to
// transpose.
function getCommandBarItems(context = {}) {
	const { filtering, bookmarkOpen, panelOpen, pickerOpen, panelArmed, overlay, confirm, viewerOpen, previewFull } = context
	if (viewerOpen) return fullPreviewBar({ ...context, maximized: false })
	if (confirm) return CONFIRM_KEYS
	if (panelOpen) return pickerOpen ? PICKER_KEYS : panelArmed ? PANEL_CONFIRM_KEYS : PANEL_HINT_KEYS
	if (bookmarkOpen) return BOOKMARK_KEYS
	if (overlay === "history") return HISTORY_KEYS
	if (overlay === "trash") return TRASH_KEYS
	if (filtering) return FILTER_KEYS
	if (previewFull) return fullPreviewBar({ ...context, maximized: true })
	return workspaceBar(context)
}

// Function: barRow
// Projects a command to the small row object the command bar renders.
function barRow(command) {
	return {
		id: command.id,
		title: command.title,
		keys: command.keys,
		primary: command.primary === true,
	}
}

// Function: barCommand
// A clickable bar row backed by a command, with context-specific title/keys
// overrides (the same command reads Open in one panel and Confirm in another).
// The registry is static, so an unknown id is a programming error, caught at
// load rather than skipping a row silently.
function barCommand(id, overrides = {}) {
	const command = getCommand(id)
	if (!command) throw new Error(`command bar: unknown command "${id}"`)
	return { ...barRow(command), ...overrides }
}

// Function: barHint
// A non-clickable key hint row (navigation steps with no command behind them).
function barHint(title, keys, primary = false) {
	return { id: null, title, keys, primary }
}

// Function: workspaceBar
// The workspace hints follow the focused column: a source/destination pane,
// the explorer's parent mirror, or the inspector over a directory/file. Every
// column keeps the panel entry point (`:`) so the bar never hides the way to
// the full command set. A `stat` card has no listing of its own, so it keeps
// Open/Edit but drops Mark, Filter and Bookmarks (which act on the pane's
// cursor entry, not on the card).
function workspaceBar(context = {}) {
	const active = `${context.active ?? "left"}`
	const previewVisible = Boolean(context.previewVisible)
	const tail = [
		barCommand("app.help"),
		barCommand("bookmark.open"),
		barCommand("view.toggleMode"),
	]
	// A `stat` card has no listing of its own: Open/Edit act on the card, but
	// Marks, Filter and Bookmarks act on the pane's cursor entry, which the
	// card may not show. Keep them off its bar.
	const cardTail = [barCommand("app.help"), barCommand("view.toggleMode")]
	if (active === "parent" && context.viewMode === "explorer") {
		return [
			barCommand("panel.open"),
			barCommand("pane.enter", { title: "Open", keys: "→/Enter", primary: true }),
			barCommand("pane.up", { title: "Parent", keys: "←" }),
			barCommand("list.mark"),
			barCommand("filter.start"),
			barCommand("pane.toggle"),
			barCommand("view.togglePreview"),
			...tail,
		]
	}
	if (active === "preview" && previewVisible) {
		const hide = barCommand("view.togglePreview", { title: "Hide" })
		const maximize = barCommand("view.maximize", { title: "Maximize", keys: "⇧V" })
		if (context.previewDirectory) {
			return [
				barCommand("panel.open"),
				barCommand("pane.enter", { title: "Open", keys: "→/Enter", primary: true }),
				barCommand("pane.up", { title: "Parent", keys: "←" }),
				barCommand("list.mark"),
				barCommand("pane.toggle"),
				hide,
				maximize,
				...tail,
			]
		}
		return [
			barCommand("panel.open"),
			barCommand("file.open", { title: "Open" }),
			barCommand("file.edit", { title: "Edit" }),
			barCommand("pane.toggle"),
			hide,
			maximize,
			...cardTail,
		]
	}
	return [
		barCommand("panel.open"),
		barCommand("pane.enter", { title: "Open", keys: "→/Enter", primary: true }),
		barCommand("list.mark"),
		barCommand("filter.start"),
		barCommand("pane.toggle"),
		barCommand("view.togglePreview"),
		...tail,
	]
}

// Function: fullPreviewBar
// The fullscreen viewer or the maximized preview. A file scrolls and steps
// through its neighbours; a directory column keeps listing navigation. The
// close affordance is the key that actually leaves the mode: Esc/v in the
// viewer, ⇧V when the preview is maximized. Open/Edit take the same chords in
// both modes (⇧O/⇧E, the keymap's bindings).
function fullPreviewBar(context = {}) {
	const close = context.maximized
		? barCommand("view.maximize", { title: "Restore", keys: "⇧V" })
		: barCommand("view.toggleViewer", { title: "Close", keys: "Esc" })
	if (context.previewDirectory) {
		return [
			barHint("Row", "↑/↓"),
			barCommand("pane.enter", { title: "Open", keys: "→/Enter", primary: true }),
			barCommand("pane.up", { title: "Parent", keys: "←" }),
			barCommand("list.mark"),
			close,
		]
	}
	return [
		barHint("Scroll", "↑/↓"),
		barCommand("nav.up", { title: "Prev", keys: "←" }),
		barCommand("nav.down", { title: "Next", keys: "→" }),
		barCommand("file.open", { title: "Open" }),
		barCommand("file.edit", { title: "Edit" }),
		close,
	]
}

export { getCommandBarItems }

// EOF
