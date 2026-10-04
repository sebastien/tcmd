// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/CommandPalette
// CommandPalette: popup listing commands filtered by the typed query. In
// scripting mode it lists operations and filesets and prefixes the input with
// `:`. The row logic lives in `PaletteRow.js`; this parent maps its `items` to
// rows.
//
// Environment: `overlayBg`, `borderPrimaryActiveFg`, `textSecondaryFg`
// (footer), `textHeadingFg` (exposed as the `titleColor` behavior),
// `rows(data)` returning the keyed rows and `scrollTop(self, data)` (TUI
// viewport tracking).

import { unwrap } from "select/state/cells"

// Function: paletteSign
// The prompt shown before the input; overridable per renderer.
function paletteSign(mode) {
	return unwrap(mode) === "script" ? ":" : "›"
}

// Function: paletteTitle
function paletteTitle(mode) {
	return unwrap(mode) === "script" ? "script" : "palette"
}

// Function: createBehaviors
// Builds the CommandPalette behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		bg: () => env.overlayBg,
		borderFg: () => env.borderPrimaryActiveFg,
		confirm: (self, data) => self.pub("palette:confirm", unwrap(data.query) ?? ""),
		focused: (_self, data) => Boolean(unwrap(data.open)),
		footer: (_self, data) =>
			unwrap(data.mode) === "script"
				? "Tab complete   ↵ run   Esc close"
				: "↑↓ move   Tab complete   ↵ run   Esc close",
		footerFg: () => env.textSecondaryFg,
		sign: (_self, data) => paletteSign(data.mode),
		title: (_self, data) => paletteTitle(data.mode),
		titleColor: () => env.textHeadingFg,
	}
	if (env?.rows) {
		behaviors.rows = (_self, data) => env.rows(data)
	}
	if (env?.scrollTop) {
		behaviors.scrollTop = (self, data) => env.scrollTop(self, data)
	}
	return behaviors
}

export { createBehaviors, paletteSign, paletteTitle }

// EOF
