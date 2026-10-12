// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/Breadcrumbs
// PathBreadcrumbs: clickable path elements for one pane. The row logic lives
// in `Crumb.js`; this parent only maps its `segments` to `Crumb` rows and
// exposes the web root class.
//
// Environment: `rows(data)` returning the keyed row list and `listClass`
// (web root class); both are injected by the renderer binding. The TUI binds
// this component to the shared `RowList.xml`, the web to `RowList.html`.

// Function: createBehaviors
// Builds the Breadcrumbs behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = { listClass: () => env?.listClass }
	if (env?.rows) {
		behaviors.rows = (self, data) => env.rows(self, data)
	}
	return behaviors
}

export { createBehaviors }

// EOF
