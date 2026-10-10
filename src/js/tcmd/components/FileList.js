// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/FileList
// FileList: the scrollable, cursorable list of entries for one pane. The row
// logic lives in `FileRow.js`; this parent maps its `entries` to rows and
// provides the empty/loading states.
//
// Environment:
// - `rows(data)` returning the keyed row list.
// - `scrollTop(self, data)` (TUI viewport tracking).
// - `textSecondaryFg` for the state rows.

import { unwrap } from "select/state/cells"

// Function: createBehaviors
// Builds the FileList behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		emptyText: () => "  (empty)",
		emptyFg: () => env?.textSecondaryFg,
		loadingText: () => "  loading…",
		loadingFg: () => env?.textSecondaryFg,
		showEmpty: (_self, data) =>
			!unwrap(data.loading) && (unwrap(data.entries)?.length ?? 0) === 0,
		showLoading: (_self, data) => Boolean(unwrap(data.loading)),
	}
	if (env?.rows) {
		behaviors.rows = (self, data) => env.rows(self, data)
	}
	if (env?.scrollTop) {
		behaviors.scrollTop = (self, data) => env.scrollTop(self, data)
	}
	return behaviors
}

export { createBehaviors }

// EOF
