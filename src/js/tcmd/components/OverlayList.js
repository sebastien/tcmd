// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-17

// Module: tcmd/components/OverlayList
// The shared modal list overlay: the undo history (`u`) and the trash browser
// (`⇧T`). One component, two modes — `history` lists the journal (a row jumps
// the file state to that point), `trash` lists trashed entries (a row restores
// one). The row logic lives in `OverlayRow.js`; this parent maps its `items` to
// rows and switches title/footer/empty text on the mode.
//
// Environment: `overlayBg`, `borderPrimaryActiveFg`, `textHeadingFg` (title),
// `textSecondaryFg` (footer/empty), `rows(data)` returning the keyed rows and
// `scrollTop(self, data)` (TUI viewport tracking).

import { unwrap } from "select/state/cells"

// Function: overlayMode
// "trash" or "history" for the data's mode (an absent mode reads as history).
function overlayMode(mode) {
	return unwrap(mode) === "trash" ? "trash" : "history"
}

// Function: overlayTitle
function overlayTitle(mode) {
	return overlayMode(mode)
}

// Function: overlayFooter
function overlayFooter(mode) {
	return overlayMode(mode) === "trash"
		? "↑↓ move   ↵ restore   Esc close"
		: "↑↓ move   ↵ jump   Esc close"
}

// Function: overlayEmpty
// The empty-state line: no history yet, or an empty trash.
function overlayEmpty(mode) {
	return overlayMode(mode) === "trash" ? "  trash is empty" : "  no history yet"
}

// Function: createBehaviors
// Builds the OverlayList behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		bg: () => env.overlayBg,
		borderFg: () => env.borderPrimaryActiveFg,
		titleColor: () => env.textHeadingFg,
		title: (_self, data) => overlayTitle(data.mode),
		footer: (_self, data) => overlayFooter(data.mode),
		footerFg: () => env.textSecondaryFg,
		empty: (_self, data) => overlayEmpty(data.mode),
		emptyFg: () => env.textSecondaryFg,
		emptyVisible: (_self, data) => (unwrap(data.items)?.length ?? 0) === 0,
		open: (_self, data) => Boolean(unwrap(data.open)),
	}
	if (env?.rows) {
		behaviors.rows = (self, data) => env.rows(self, data)
	}
	if (env?.scrollTop) {
		behaviors.scrollTop = (self, data) => env.scrollTop(self, data)
	}
	return behaviors
}

export { createBehaviors, overlayEmpty, overlayFooter, overlayMode, overlayTitle }

// EOF
