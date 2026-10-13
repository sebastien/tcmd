// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandPanel
// CommandPanel: the one entry point (`:`), a two-pane palette. The left pane
// holds a `:` filter above the command list — the CLI operations, flat. The
// right pane lists the selected operation's arguments — one row per argument,
// its label and its value (a bracketed field, or a checkbox/radio list of the
// selected paths) — under the operation's name, with the resolved command at
// the pane's foot. The row logic lives in `CommandArgRow.js`; this parent maps
// the command list and the argument rows.
//
// Environment: `overlayBg`, `borderPrimaryActiveFg`, `textSecondaryFg`
// (footer), `textHeadingFg` (title/sign/command name), `opRows(self, data)` /
// `argRows(self, data)` returning the keyed row lists, and
// `argScrollTop(self, data)` (TUI viewport tracking).

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
const PANEL_FOOTER = "type to filter   ⇥ args   ⌃O browse   Spc toggle   ↵ run   Esc close"

// Function: pickerFooter
const PICKER_FOOTER = "type to filter   ↑↓ row   → open   ↵ choose   ⌃↵ this dir   ⌫ up   Esc back"

// Function: panelSign
// The filter prompt (`:`) before the command filter input.
function panelSign() {
	return ":"
}

// Function: createBehaviors
// Builds the CommandPanel behavior map for the given renderer environment.
function createBehaviors(env) {
	const panelOpen = (_self, data) => Boolean(unwrap(data.open))
	const behaviors = {
		bg: () => env.overlayBg,
		borderFg: () => env.borderPrimaryActiveFg,
		// The right pane's header: the selected command's name.
		commandName: (_self, data) => unwrap(data.entry)?.name ?? "",
		commandNameFg: () => env.textHeadingFg,
		confirm: (self) => self.pub("panel:confirm"),
		// The argument pane's empty state: an operation with no bound rows has
		// nothing to fill. While picking the picker's own empty state stands in.
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
		// Dividers: a vertical rule between the panes, horizontal ones under the
		// filter and above the resolved command — all in the secondary border
		// colour, like the pane header rules.
		ruleFg: () => env.borderSecondaryFg,
		sideRule: () => ["left"],
		headRule: () => ["top"],
		labelFg: () => env.textSecondaryFg,
		focusArgs: (_self, data) => unwrap(data.focus) === PANEL_FOCUS.ARGS,
		focusOps: (_self, data) => unwrap(data.focus) === PANEL_FOCUS.OPS,
		open: (_self, data) => Boolean(unwrap(data.open)),
		// The resolved command the draft expands to, dim, at the foot of the
		// argument pane; a `«NAME»` marks a required argument still to fill.
		preview: (_self, data) => unwrap(data.command) ?? "",
		runnableState: (_self, data) => `${unwrap(data.runnable) !== false}`,
		previewFg: () => env.textSecondaryFg,
		// The filter input owns the keyboard while the panel is open, the
		// command list is focused and the picker is not browsing.
		queryFocused: (self, data) =>
			panelOpen(self, data) && !unwrap(data.picking) && unwrap(data.focus) !== PANEL_FOCUS.ARGS,
		sign: () => panelSign(),
		signFg: () => env.textHeadingFg,
		title: (_self, data) => panelTitle(data.entry),
		titleColor: () => env.textHeadingFg,
	}
	if (env?.opRows) behaviors.opRows = (self, data) => env.opRows(self, data)
	if (env?.argRows) behaviors.argRows = (self, data) => env.argRows(self, data)
	if (env?.argScrollTop) behaviors.argScrollTop = (self, data) => env.argScrollTop(self, data)
	return behaviors
}

export { PANEL_FOOTER, PICKER_FOOTER, createBehaviors, panelSign, panelTitle }
