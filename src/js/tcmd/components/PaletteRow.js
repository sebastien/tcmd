// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/PaletteRow
// Command-palette row behaviors. Read `{ item: command, index, selected }`, the
// same bag shape in both engines. Selection is snapshotted by the row builder
// into a plain `selectedRow` boolean and read through the shared `isSelected`
// predicate, with the `selected` cell as fallback for hand-built bags. Script
// rows carry a `detail` (operation signature, fileset count) appended to the
// label.
//
// Environment: `accentFg`, `textFg`, `selectionBg` (TUI row background),
// `selectedClass` (web).

import { isSelected } from "./rows.js"

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
		rowBg: (_self, data) => (isSelected(data) ? env.selectionBg : undefined),
		rowClass: (_self, data) => (isSelected(data) ? env.selectedClass : null),
		rowFg: (_self, data) => (isSelected(data) ? env.accentFg : env.textFg),
		// TUI: a marker so the selection is not color-only.
		rowMarker: (_self, data) => (isSelected(data) ? ">" : " "),
	}
}

export { createBehaviors, paletteLabel }

// EOF
