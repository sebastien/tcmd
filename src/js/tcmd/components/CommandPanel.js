// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandPanel
// CommandPanel: the one entry point (`:`), laid out like a command line. The
// top row is the command: a prompt, the command-name field (typing filters and
// completes the entry, the remaining characters shown as a dim ghost suffix),
// then one inline field per textual argument (literal/raw/path/dest/buffer).
// Directly under it, dim, is the resolved command the draft expands to (a
// `rename` previews its `old → new` mapping instead). Below a rule sit the two
// columns: the entry list on the left, and the *context* on the right — the
// selection bindings (one header per argument, one row per marked path with a
// `[x]`/`[ ]` toggle). Tab completes the name then walks the ring (name →
// fields → context rows); Enter runs a complete command or jumps to the next
// missing field. The row logic lives in `CommandArgRow.js`; the inline field
// logic in `CommandField.js`.
//
// Environment: `overlayBg`, `borderPrimaryActiveFg`, `textSecondaryFg`
// (footer/ghost), `textHeadingFg` (title/sign), `opRows(self, data)` /
// `argRows(self, data)` / `fieldRows(self, data)` returning the keyed row
// lists, and `argScrollTop(self, data)` (TUI viewport tracking).

import { unwrap } from "select/state/cells"
import { PANEL_FOCUS } from "../core/panel.js"

// Function: panelTitle
// " Command · copy " while an entry is selected (spaces so the title sits
// clear of the border corners).
function panelTitle(entry) {
	const name = unwrap(entry)?.name
	return name ? ` Command · ${name} ` : " Command "
}

// Function: panelFooter
const PANEL_FOOTER = "type to command   ⇥ field   ⌃O browse   Spc toggle   ↵ run   Esc close"

// Function: pickerFooter
const PICKER_FOOTER = "type to filter   ↑↓ row   → open   ↵ choose   ⌃↵ this dir   ⌫ up   Esc back"

// Function: panelSign
// The prompt before the command-name field (a trailing space so the typed text
// doesn't crowd the arrow; overridable per renderer).
function panelSign() {
	return "› "
}

// Function: createBehaviors
// Builds the CommandPanel behavior map for the given renderer environment.
function createBehaviors(env) {
	// None of the row's inputs may take focus while the panel is closed: the
	// host keeps the subtree mounted, so a `focused` flag that ignored `open`
	// would let a hidden field steal the keyboard.
	const panelOpen = (_self, data) => Boolean(unwrap(data.open))
	const nameFocused = (_self, data) =>
		panelOpen(_self, data) && !unwrap(data.picking) && unwrap(data.focus) === PANEL_FOCUS.OPS
	const behaviors = {
		bg: () => env.overlayBg,
		borderFg: () => env.borderPrimaryActiveFg,
		// Enter in a field runs the operation (the App key handler routes Enter
		// for the context rows).
		confirm: (self) => self.pub("panel:confirm"),
		// The command-name field: the input is rendered while it owns the
		// keyboard; its dim ghost suffix suggests the rest of the selected
		// entry's name.
		nameFocused,
		nameText: (_self, data) => `${unwrap(data.query) ?? ""}`,
		nameFg: () => env.textFg,
		// The name input is sized to its content so the ghost completion sits
		// right after the typed text.
		nameWidth: (_self, data) => Math.max(4, `${unwrap(data.query) ?? ""}`.length + 2),
		ghostVisible: (self, data) => nameFocused(self, data) && Boolean(unwrap(data.completion)),
		ghost: (_self, data) => unwrap(data.completion) ?? "",
		ghostFg: () => env.textSecondaryFg,
		// The context column's empty state: nothing to toggle (a TinyCmd action
		// binds no arguments; a command whose arguments are all textual has no
		// selection context). While picking the picker's own empty state stands
		// in.
		argsEmpty: (_self, data) =>
			!unwrap(data.picking) && (unwrap(data.rows)?.length ?? 0) === 0,
		argsEmptyText: () => "no arguments",
		// The file picker sub-mode: a path line, its own filter input, and the
		// entry rows (rendered through the shared arg-row map).
		picking: (_self, data) => Boolean(unwrap(data.picking)),
		pickerPath: (_self, data) => unwrap(data.pickerPath) ?? "",
		pickerSign: () => "⌕ ",
		pickerFocused: (self, data) => panelOpen(self, data) && Boolean(unwrap(data.picking)),
		pickerEmpty: (_self, data) =>
			Boolean(unwrap(data.picking)) && (unwrap(data.rows)?.length ?? 0) === 0,
		pickerEmptyText: () => "  empty",
		footer: (_self, data) => (unwrap(data?.picking) ? PICKER_FOOTER : PANEL_FOOTER),
		footerFg: () => env.textSecondaryFg,
		// Dividers: a vertical rule between the entry list and the context
		// column, a horizontal one above them — both in the secondary border
		// colour, like the pane header rules.
		ruleFg: () => env.borderSecondaryFg,
		sideRule: () => ["left"],
		headRule: () => ["top"],
		labelFg: () => env.textSecondaryFg,
		focusArgs: (_self, data) => unwrap(data.focus) === PANEL_FOCUS.ARGS,
		focusOps: (_self, data) => unwrap(data.focus) === PANEL_FOCUS.OPS,
		open: (_self, data) => Boolean(unwrap(data.open)),
		// The resolved command the draft expands to, dim, right under the
		// command row; a `«NAME»` marks a required argument still to fill.
		preview: (_self, data) => unwrap(data.command) ?? "",
		runnableState: (_self, data) => `${unwrap(data.runnable) !== false}`,
		previewFg: () => env.textSecondaryFg,
		sign: () => panelSign(),
		signFg: () => env.textHeadingFg,
		title: (_self, data) => panelTitle(data.entry),
		titleColor: () => env.textHeadingFg,
	}
	if (env?.opRows) behaviors.opRows = (self, data) => env.opRows(self, data)
	if (env?.argRows) behaviors.argRows = (self, data) => env.argRows(self, data)
	if (env?.fieldRows) behaviors.fieldRows = (self, data) => env.fieldRows(self, data)
	if (env?.argScrollTop) behaviors.argScrollTop = (self, data) => env.argScrollTop(self, data)
	return behaviors
}

export { PANEL_FOOTER, PICKER_FOOTER, createBehaviors, panelSign, panelTitle }
