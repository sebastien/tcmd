// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-30

// Module: tcmd/components/FilterBar
// FilterBar: the fuzzy filter indicator, folded into the pane header so it
// never shifts the listing. While the pane owns the filter input
// (`filtering === paneId`) it shows a compact focused input bound to the pane's
// `query`; each change also routes through the pane's `setFilter` (passed as
// `setFilter`), so the cursor re-anchors with no directory watcher. Once
// accepted it degrades to the same `/ query` indication, so the pane is
// navigable again and the filter can still be cleared with Esc. When the query
// matches no entry it shows a `no match` alert. The key hints live in the
// command bar, not here.
//
// Environment: `accentFg` (the applied label), `textSecondaryFg` (the `/`
// prompt), `warningFg` (the no-match alert).

import { unwrap } from "select/state/cells"

// Function: createBehaviors
// Builds the FilterBar behavior map for the given renderer environment.
function createBehaviors(env) {
	// The pane that owns the input is the one typing into it.
	const editing = (_self, data) => unwrap(data.filtering) === unwrap(data.paneId)
	const queryText = (_self, data) => `${unwrap(data.query) ?? ""}`
	const activeQuery = (self, data) => queryText(self, data).trim()
	const matchCount = (_self, data) => (unwrap(data.entries) ?? []).length
	return {
		// The row exists while editing or once a non-empty filter is applied.
		alert: (self, data) =>
			activeQuery(self, data).length > 0 && matchCount(self, data) === 0 ? "no match" : "",
		alertFg: () => env.warningFg,
		applied: (self, data) => !editing(self, data) && activeQuery(self, data).length > 0,
		editing,
		focused: editing,
		// The input both displays and captures through `inout`; `on:input`
		// additionally routes the change through the pane's `setFilter` so the
		// cursor re-anchors on the first match. The TUI delivers the input
		// value directly, the DOM an event carrying it.
		onFilter: (_self, data, event) => {
			const value = typeof event === "string" ? event : `${event?.target?.value ?? ""}`
			data.setFilter?.(value)
		},
		// The bare query (shared with the web presentation).
		label: (self, data) => queryText(self, data),
		labelFg: () => env.accentFg,
		// TUI: the static label renders the full `/ query`, so the editing
		// input and the accepted state read the same.
		labelText: (self, data) => `/ ${queryText(self, data)}`,
		prompt: () => "/ ",
		promptFg: () => env.textSecondaryFg,
		visible: (self, data) => editing(self, data) || activeQuery(self, data).length > 0,
	}
}

export { createBehaviors }

// EOF
