// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/BookmarkRow
// One row of the bookmark picker. Reads `{ item: { name, path }, index,
// selected }`, the same bag shape in both engines. `selected` is a reactive
// cell, read with `unwrap` at the point of use.
//
// Environment: `accentFg`, `textFg`, `textSecondaryFg`, `selectionBg` (TUI row
// background), `selectedClass` (web).

import { unwrap } from "select/state/cells"

// Function: createBehaviors
// Builds the BookmarkRow behavior map for the given renderer environment.
function createBehaviors(env) {
	const isSelected = (data) => data.index === unwrap(data.selected)
	return {
		rowBg: (_self, data) => (isSelected(data) ? env.selectionBg : undefined),
		rowClass: (_self, data) => (isSelected(data) ? env.selectedClass : null),
		rowFg: (_self, data) => (isSelected(data) ? env.accentFg : env.textFg),
		rowMarker: (_self, data) => (isSelected(data) ? ">" : " "),
		// A directory bookmark reads as `name/`, mirroring the listing.
		rowName: (_self, data) =>
			`${data.item?.name ?? ""}${data.item?.isDir === true ? "/" : ""}`,
		rowPath: (_self, data) => `${data.item?.path ?? ""}`,
		rowPathFg: () => env.textSecondaryFg,
	}
}

export { createBehaviors }
