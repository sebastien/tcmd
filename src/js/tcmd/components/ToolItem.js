// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/ToolItem
// Toolbar entry behaviors. Read `{ item: command, index }`, the same bag shape
// in both engines.
//
// Environment: `accentFg`, `dimFg`.

// Function: toolLabel
// "Switch[Tab] " style label.
function toolLabel(command) {
	if (!command) return ""
	return `${command.title}[${command.keys}] `
}

// Function: createBehaviors
// Builds the ToolItem behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		toolFg: (_self, data) => (data.index === 0 ? env.accentFg : env.dimFg),
		toolLabel: (_self, data) => toolLabel(data.item),
	}
}

export { createBehaviors, toolLabel }
