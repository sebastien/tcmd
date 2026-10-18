// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandPanel
// CommandPanel: the one entry point (`:`), a two-pane palette. The left pane
// holds a `:` filter above the CLI operations grouped by risk color. The right
// pane lists the selected operation's arguments followed by its [Run]/[Retry]
// row.
// The row logic lives in `CommandArgRow.js`; this parent maps the operation
// list, scrolling argument rows, custom preview and pinned action row.
//
// Environment: `overlayBg`, `borderPrimaryActiveFg`, `textSecondaryFg`
// (footer), `textHeadingFg` (title/sign/command name), `opRows(self, data)` /
// `argRows(self, data)` returning keyed row lists, and
// the TUI viewport hooks `opScrollTop` / `argScrollTop`.

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
			!unwrap(data.picking) && !(unwrap(data.rows) ?? []).some((row) => row.type !== "run"),
		argsEmptyText: () => "no arguments",
		// The file picker sub-mode: a nested pane with its path, filter input and
		// entry rows (rendered through the shared arg-row map).
		picking: (_self, data) => Boolean(unwrap(data.picking)),
		pickerPath: (_self, data) => unwrap(data.pickerPath) ?? "",
		pickerSign: () => "⌕ ",
		pickerFocused: (self, data) => panelOpen(self, data) && Boolean(unwrap(data.picking)),
		pickerEmpty: (_self, data) =>
			Boolean(unwrap(data.picking)) && !(unwrap(data.rows) ?? []).some((row) => row.type === "entry"),
		pickerEmptyText: () => "  empty",
		footer: (_self, data) => (unwrap(data?.picking) ? PICKER_FOOTER : PANEL_FOOTER),
		footerFg: () => env.textSecondaryFg,
		// Dividers: a vertical rule between the panes and a horizontal rule under
		// the filter, in the secondary border colour.
		ruleFg: () => env.borderSecondaryFg,
		sideRule: () => ["left"],
		headRule: () => ["top"],
		pickerBottomRule: () => ["bottom"],
		labelFg: () => env.textSecondaryFg,
		focusArgs: (_self, data) => unwrap(data.focus) === PANEL_FOCUS.ARGS,
		focusOps: (_self, data) => unwrap(data.focus) === PANEL_FOCUS.OPS,
		open: (_self, data) => Boolean(unwrap(data.open)),
		// The filter input owns the keyboard while the panel is open, the
		// command list is focused and the picker is not browsing.
		queryFocused: (self, data) =>
			panelOpen(self, data) && !unwrap(data.picking) && unwrap(data.focus) !== PANEL_FOCUS.ARGS,
		// Only operation-specific preflight output is rendered; the assembled
		// shell command remains available from the session but is not echoed.
		hasPreview: (_self, data) => !unwrap(data.picking) && Boolean(unwrap(data.preview)),
		preview: (_self, data) => unwrap(data.preview) ?? "",
		previewFg: () => env.textSecondaryFg,
		panelHeight: (self, data) => env.panelHeight?.(self, data) ?? "72%",
		sign: () => panelSign(),
		signFg: () => env.textHeadingFg,
		title: (_self, data) => panelTitle(data.entry),
		titleColor: () => env.textHeadingFg,
	}
	if (env?.opRows) behaviors.opRows = (self, data) => env.opRows(self, data)
	if (env?.argRows) behaviors.argRows = (self, data) => env.argRows(self, data)
	if (env?.runRows) behaviors.runRows = (self, data) => env.runRows(self, data)
	if (env?.opScrollTop) behaviors.opScrollTop = (self, data) => env.opScrollTop(self, data)
	if (env?.argScrollTop) behaviors.argScrollTop = (self, data) => env.argScrollTop(self, data)
	return behaviors
}

export { PANEL_FOOTER, PICKER_FOOTER, createBehaviors, panelSign, panelTitle }
