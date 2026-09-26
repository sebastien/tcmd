// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/Toolbar
// Toolbar: labeled operations with their keyboard shortcuts. The row logic
// lives in `ToolItem.js`; this parent only maps its `commands` to rows.
//
// Environment: `rows(data)` returning the keyed row list.

// Function: createBehaviors
// Builds the Toolbar behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {}
	if (env?.rows) {
		behaviors.rows = (_self, data) => env.rows(data)
	}
	return behaviors
}

export { createBehaviors }
