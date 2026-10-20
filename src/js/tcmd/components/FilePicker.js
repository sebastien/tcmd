// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-20

// Module: tcmd/components/FilePicker
// The command panel's file picker: an editable path line over a file-panel
// listing (`FilePickerRow`), with the `..` parent row kept at the top. Typing
// in the path narrows the listing (or enters a directory) through the session's
// path resolution; the row logic lives in `FilePickerRow.js`.
//
// Environment: `rows(self, data)` returning keyed `FilePickerRow`s and
// `scrollTop(self, data)` (TUI viewport tracking).

import { unwrap } from "select/state/cells"

// Function: createBehaviors
// Builds the FilePicker behavior map for the given renderer environment.
function createBehaviors(env) {
	const open = (_self, data) => Boolean(unwrap(data.open))
	const behaviors = {
		open,
		// The editable path owns the keyboard by default; Down/Tab hands it to
		// the entry list.
		pathFocused: (_self, data) => open(_self, data) && (unwrap(data.focus) ?? "path") === "path",
		pathSign: () => "› ",
		pathSignFg: () => env.accentFg,
		// The parent row is a navigation row, not a match: an empty listing is
		// an empty result even while `..` stays visible.
		empty: (_self, data) =>
			open(_self, data) && !(unwrap(data.rows) ?? []).some((row) => row.type === "entry"),
		emptyText: () => "  no matches",
		emptyFg: () => env.textSecondaryFg,
		rule: () => ["bottom"],
		ruleFg: () => env.borderSecondaryFg,
		borderFg: () => env.borderSecondaryFg,
	}
	if (env?.rows) behaviors.rows = (self, data) => env.rows(self, data)
	if (env?.scrollTop) behaviors.scrollTop = (self, data) => env.scrollTop(self, data)
	return behaviors
}

export { createBehaviors }
