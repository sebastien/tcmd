// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/PaletteRow
// Command-palette row behaviors. Read `{ item: command, index, selected }`, the
// same bag shape in both engines. `selected` is a reactive cell, read with
// `unwrap` at the point of use.
//
// Environment: `accentFg`, `textFg`, `selectedClass`.

import { unwrap } from "select/state/cells"

// Function: paletteLabel
function paletteLabel(command) {
	if (!command) return ""
	return `${command.title} [${command.keys}]`
}

// Function: createBehaviors
// Builds the PaletteRow behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		paletteLabel: (_self, data) => paletteLabel(data.item),
		rowClass: (_self, data) =>
			data.index === unwrap(data.selected) ? env.selectedClass : null,
		rowFg: (_self, data) =>
			data.index === unwrap(data.selected) ? env.accentFg : env.textFg,
	}
}

export { createBehaviors, paletteLabel }

// EOF
