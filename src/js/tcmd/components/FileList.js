// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/FileList
// FileList: the scrollable, cursorable list of entries for one pane. The row
// logic lives in `FileRow.js`; this parent maps its `entries` to rows.
//
// Environment:
// - `rows(data)` returning the keyed row list.
// - `scrollTop(self, data)` (TUI viewport tracking).

// Function: createBehaviors
// Builds the FileList behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {}
	if (env?.rows) {
		behaviors.rows = (_self, data) => env.rows(data)
	}
	if (env?.scrollTop) {
		behaviors.scrollTop = (self, data) => env.scrollTop(self, data)
	}
	return behaviors
}

export { createBehaviors }

// EOF
