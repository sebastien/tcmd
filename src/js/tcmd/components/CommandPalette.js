// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/CommandPalette
// CommandPalette: popup listing commands filtered by the typed query. The row
// logic lives in `PaletteRow.js`; this parent maps its `items` to rows.
//
// Environment: `paletteBg`, `titleFg`, `rows(data)` returning the keyed rows.

import { read } from "./read.js"

// Function: createBehaviors
// Builds the CommandPalette behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		bg: () => env.paletteBg,
		confirm: (self, data) => self.pub("palette:confirm", read(data.query) ?? ""),
		focused: (_self, data) => Boolean(read(data.open)),
		titleFg: () => env.titleFg,
	}
	if (env?.rows) {
		behaviors.rows = (_self, data) => env.rows(data)
	}
	return behaviors
}

export { createBehaviors }
