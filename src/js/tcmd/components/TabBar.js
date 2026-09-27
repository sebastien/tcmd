// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/TabBar
// TabBar: a pane's tabs plus the "+" affordance that opens a new tab. The row
// logic lives in `TabItem.js`.
//
// Environment: `rows(data)` returning the keyed row list, `listClass` (web
// root class), `dimFg` (the "+" hint).

// Function: createBehaviors
// Builds the TabBar behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		addFg: () => env?.dimFg,
		addLabel: () => "+ ",
		listClass: () => env?.listClass,
	}
	if (env?.rows) {
		behaviors.rows = (_self, data) => env.rows(data)
	}
	return behaviors
}

export { createBehaviors }

// EOF
