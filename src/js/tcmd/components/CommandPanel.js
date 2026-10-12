// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/CommandPanel
// CommandPanel: the one entry point (`:`). A filter input at the top narrows
// the left entry list as you type (the matching entry takes the cursor); the
// list marks CLI operations and TinyCmd actions apart by their namespace
// marker. A right column shows the selected operation's arguments: one header
// row per argument (its name and binding summary) and, for a selection, one
// row per path with a `[x]`/`[ ]` toggle; a TinyCmd action takes none, so the
// column says so. A vertical rule divides the two columns, a horizontal one
// separates them from the "runs" line below, which shows the assembled command
// the draft maps to (the action's title when there is nothing to bind). The
// footer advertises the panel keys. The row logic lives in
// `CommandArgRow.js`; this parent maps both the entry list and the flattened
// argument rows.
//
// Environment: `overlayBg`, `borderPrimaryActiveFg`, `textSecondaryFg`
// (footer), `textHeadingFg` (title/sign), `accentFg` (preview),
// `errorFg` (unrunnable preview), `opRows(self, data)` / `argRows(self, data)`
// returning the keyed row lists, and `argScrollTop(self, data)` (TUI viewport
// tracking).

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
const PANEL_FOOTER = "type to filter   ⇥ args   Spc toggle   ↵ run   Esc close"

// Function: panelSign
// The prompt before the command filter input (a trailing space so the typed
// text doesn't crowd the arrow; overridable per renderer).
function panelSign() {
	return "› "
}

// Function: createBehaviors
// Builds the CommandPanel behavior map for the given renderer environment.
function createBehaviors(env) {
	// The assembled command line's colour, shared by the line and its "runs"
	// label: the preview reads as an error until every required argument is
	// filled.
	const previewColor = (data) => (unwrap(data.runnable) === false ? env.errorFg ?? env.accentFg : env.accentFg)
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
		// The argument column's empty state: a TinyCmd action binds no
		// arguments, so there is nothing to edit or toggle.
		argsEmpty: (_self, data) => (unwrap(data.rows)?.length ?? 0) === 0,
		argsEmptyText: () => "no arguments",
		footer: () => PANEL_FOOTER,
		footerFg: () => env.textSecondaryFg,
		// Dividers: a vertical rule between the entry list and the argument
		// sidebar, a horizontal one above the "runs" preview — both in the
		// secondary border colour, like the pane header rules.
		ruleFg: () => env.borderSecondaryFg,
		sideRule: () => ["left"],
		headRule: () => ["top"],
		labelFg: () => env.textSecondaryFg,
		focusArgs: (_self, data) => unwrap(data.focus) === PANEL_FOCUS.ARGS,
		focusOps: (_self, data) => unwrap(data.focus) !== PANEL_FOCUS.ARGS,
		open: (_self, data) => Boolean(unwrap(data.open)),
		// The assembled command line the draft maps to, and its colour (see
		// `previewColor`); the "runs" label wears the same colour so the two
		// read as one block.
		preview: (_self, data) => unwrap(data.command) ?? "",
		runnableState: (_self, data) => `${unwrap(data.runnable) !== false}`,
		previewFg: (_self, data) => previewColor(data),
		previewLabel: () => "runs",
		previewLabelFg: (_self, data) => previewColor(data),
		// The filter input owns the keyboard while the panel is open and the
		// command column is focused; typing narrows the operation list.
		queryFocused: (_self, data) => Boolean(unwrap(data.open)) && unwrap(data.focus) !== PANEL_FOCUS.ARGS,
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

export { PANEL_FOOTER, createBehaviors, panelSign, panelTitle }
