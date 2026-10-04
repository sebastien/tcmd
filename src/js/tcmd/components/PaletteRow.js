// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/PaletteRow
// Command-palette row behaviors. Read `{ item: command, index, selected }`, the
// same bag shape in both engines. `selected` is a reactive cell, read with
// `unwrap` at the point of use. Script rows carry a `detail` (operation
// signature, fileset count) appended to the label.
//
// Environment: `accentFg`, `textFg`, `selectionBg` (TUI row background),
// `selectedClass` (web).

import { unwrap } from "select/state/cells"

// Function: paletteLabel
// "Switch [Tab]" for commands; script rows append their detail.
function paletteLabel(command) {
	if (!command) return ""
	const keys = command.keys ? ` [${command.keys}]` : ""
	const detail = command.detail ? `  ${command.detail}` : ""
	return `${command.title}${keys}${detail}`
}

// Function: createBehaviors
// Builds the PaletteRow behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		paletteLabel: (_self, data) => paletteLabel(data.item),
		rowBg: (_self, data) => (data.index === unwrap(data.selected) ? env.selectionBg : undefined),
		rowClass: (_self, data) =>
			data.index === unwrap(data.selected) ? env.selectedClass : null,
		rowFg: (_self, data) =>
			data.index === unwrap(data.selected) ? env.accentFg : env.textFg,
		// TUI: a marker so the selection is not color-only.
		rowMarker: (_self, data) => (data.index === unwrap(data.selected) ? ">" : " "),
	}
}

export { createBehaviors, paletteLabel }

// EOF
