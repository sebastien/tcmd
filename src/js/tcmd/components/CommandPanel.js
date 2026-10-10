// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandPanel
// CommandPanel: the Commando-style overlay (`m` / `:`). A filter input at the
// top narrows the left operation list as you type (the matching command takes
// the cursor); a right column shows the selected operation's arguments: one
// header row per argument (its name and binding summary) and, for a selection,
// one row per path with a `[x]`/`[ ]` toggle. A "runs" line under the columns
// shows the assembled command the draft maps to. The footer advertises the
// panel keys. The row logic lives in `CommandArgRow.js`; this parent maps both
// the operation list and the flattened argument rows.
//
// Environment: `overlayBg`, `borderPrimaryActiveFg`, `textSecondaryFg`
// (footer), `textHeadingFg` (title/sign), `accentFg` (preview),
// `errorFg` (unrunnable preview), `opRows(self, data)` / `argRows(self, data)`
// returning the keyed row lists, and `argScrollTop(self, data)` (TUI viewport
// tracking).

import { unwrap } from "select/state/cells"
import { PANEL_FOCUS } from "../core/panel.js"

// Function: panelTitle
// " Command · copy " while an operation is selected (spaces so the title sits
// clear of the border corners).
function panelTitle(op) {
	const name = unwrap(op)?.name
	return name ? ` Command · ${name} ` : " Command "
}

// Function: panelFooter
const PANEL_FOOTER = "type to filter   ⇥ args   Spc toggle   ↵ run   Esc close"

// Function: panelSign
// The prompt before the command filter input (overridable per renderer).
function panelSign() {
	return "›"
}

// Function: createBehaviors
// Builds the CommandPanel behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		bg: () => env.overlayBg,
		borderFg: () => env.borderPrimaryActiveFg,
		// Enter in a text field runs the operation (the App key handler routes
		// Enter for the non-input cases).
		confirm: (self) => self.pub("panel:confirm"),
		// The argument value field appears only while a textual argument owns
		// the cursor; otherwise the command filter input keeps focus.
		fieldVisible: (_self, data) => Boolean(unwrap(data.textual)) && unwrap(data.focus) === PANEL_FOCUS.ARGS,
		fieldFocused: (_self, data) => Boolean(unwrap(data.textual)) && unwrap(data.focus) === PANEL_FOCUS.ARGS,
		fieldPrompt: (_self, data) => {
			const row = unwrap(data.argRow)
			return row?.type === "arg" ? `${row.name}: ` : ""
		},
		footer: () => PANEL_FOOTER,
		footerFg: () => env.textSecondaryFg,
		labelFg: () => env.textSecondaryFg,
		focusArgs: (_self, data) => unwrap(data.focus) === PANEL_FOCUS.ARGS,
		focusOps: (_self, data) => unwrap(data.focus) !== PANEL_FOCUS.ARGS,
		open: (_self, data) => Boolean(unwrap(data.open)),
		// The assembled command line the draft maps to, and its colour: the
		// preview reads as an error until every required argument is filled.
		preview: (_self, data) => unwrap(data.command) ?? "",
		previewFg: (_self, data) =>
			unwrap(data.runnable) === false ? env.errorFg ?? env.accentFg : env.accentFg,
		previewLabel: () => "runs",
		// The filter input owns the keyboard while the panel is open and the
		// command column is focused; typing narrows the operation list.
		queryFocused: (_self, data) => Boolean(unwrap(data.open)) && unwrap(data.focus) !== PANEL_FOCUS.ARGS,
		sign: () => panelSign(),
		signFg: () => env.textHeadingFg,
		title: (_self, data) => panelTitle(data.operation),
		titleColor: () => env.textHeadingFg,
	}
	if (env?.opRows) behaviors.opRows = (_self, data) => env.opRows(self, data)
	if (env?.argRows) behaviors.argRows = (_self, data) => env.argRows(self, data)
	if (env?.argScrollTop) behaviors.argScrollTop = (self, data) => env.argScrollTop(self, data)
	return behaviors
}

export { PANEL_FOOTER, createBehaviors, panelSign, panelTitle }
