// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandPanel
// CommandPanel: the one entry point (`:`), a two-pane palette. The left pane
// holds a `:` filter above categorized commands. The right pane lists the
// selected operation's arguments followed by its [Run]/[Retry]
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
const PANEL_FOOTER = "type to filter   ⇥ args   ⌃O browse   Spc toggle   ↵ run"

// Function: pickerFooter
const PICKER_FOOTER = "type path   ↑↓ rows   → open   ↵ go   ⌃↵ here   ⇥ focus   Esc back"

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
		// The right pane's header: the selected command's name. The close
		// shorthand lives in the dialog's top border.
		commandName: (_self, data) => unwrap(data.entry)?.name ?? "",
		commandNameFg: () => env.textHeadingFg,
		closeHint: () => "[Close Esc]",
		closeHintFg: () => env.textSecondaryFg,
		confirm: (self) => self.pub("panel:confirm"),
		// The armed action prints the command it will execute below `[Confirm]`,
		// tinted with the action's risk colour.
		confirmCommand: (_self, data) =>
			(unwrap(data?.rows) ?? []).find((row) => row.type === "run")?.command ?? "",
		hasConfirmCommand: (_self, data) =>
			Boolean((unwrap(data?.rows) ?? []).find((row) => row.type === "run")?.command),
		confirmCommandFg: (_self, data) =>
			unwrap(data?.entry)?.risk === "destructive" ? env.errorFg : env.warningFg,
		confirmRisk: (_self, data) => unwrap(data?.entry)?.risk ?? null,
		// A failed run moves its error out of the action row into a framed
		// block below the button.
		hasRunError: (_self, data) =>
			Boolean((unwrap(data?.rows) ?? []).find((row) => row.type === "run" && row.error)?.error),
		runError: (_self, data) =>
			(unwrap(data?.rows) ?? []).find((row) => row.type === "run" && row.error)?.error ?? "",
		runErrorFg: () => env.errorFg,
		// The file picker sub-mode: the nested FilePicker owns its editable path,
		// file-panel rows and scrollbar.
		picking: (_self, data) => Boolean(unwrap(data.picking)),
		pickerView: (_self, data) => ({
			open: data.picking,
			path: data.pickerPathText,
			focus: data.pickerFocus,
			rows: data.pickerRows,
			cursor: data.argCursor,
		}),
		footer: (_self, data) => {
			if (unwrap(data?.picking)) return PICKER_FOOTER
			const rows = unwrap(data?.rows) ?? []
			// A focused path/destination opens its picker with Enter; Run still
			// runs or confirms from wherever the cursor sits.
			const cursorRow =
				unwrap(data?.focus) === PANEL_FOCUS.ARGS ? rows[unwrap(data?.argCursor)] : null
			const browsing = cursorRow?.type === "arg" && cursorRow.picker === true
			// An armed risky action turns Enter into the confirmation step. The
			// run row carries the flag (the rows input is already reactive).
			const armed = rows.some((row) => row.type === "run" && row.armed)
			let base = PANEL_FOOTER
			if (browsing) base = base.replace("↵ run", "↵ browse")
			else if (armed) base = base.replace("↵ run", "↵ confirm")
			// The permission grid adds a bit cursor to the usual keys.
			return unwrap(data?.entry)?.name === "chmod" ? `${base}   ←→ bits` : base
		},
		footerFg: () => env.textSecondaryFg,
		// Dividers: a vertical rule between the panes and a horizontal rule under
		// the filter, in the secondary border colour.
		ruleFg: () => env.borderSecondaryFg,
		sideRule: () => ["left"],
		headRule: () => ["top"],
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
