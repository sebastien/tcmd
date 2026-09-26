// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/PaletteRow
// Command-palette row behaviors. Read `{ item: command, index, selected }`, the
// same bag shape in both engines.
//
// Environment: `accentFg`, `textFg`, `selectedClass`.

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
			data.index === data.selected ? env.selectedClass : null,
		rowFg: (_self, data) =>
			data.index === data.selected ? env.accentFg : env.textFg,
	}
}

export { createBehaviors, paletteLabel }
