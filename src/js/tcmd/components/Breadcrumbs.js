// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/Breadcrumbs
// PathBreadcrumbs: clickable path elements for one pane. The row logic lives
// in `Crumb.js`; this parent only maps its `segments` to `Crumb` rows.
//
// Environment: `rows(data)` returning the keyed row list, injected by the
// renderer binding (TUI and web both use `Component.map`).

// Function: createBehaviors
// Builds the Breadcrumbs behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {}
	if (env?.rows) {
		behaviors.rows = (_self, data) => env.rows(data)
	}
	return behaviors
}

export { createBehaviors }
