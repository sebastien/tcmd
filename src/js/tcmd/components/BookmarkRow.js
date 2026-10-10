// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/BookmarkRow
// One row of the bookmark picker. Reads `{ item: { name, path }, index,
// selected }`, the same bag shape in both engines. Selection is snapshotted by
// the row builder into a plain `selectedRow` boolean and read through the
// shared `isSelected` predicate, with the `selected` cell as fallback for
// hand-built bags.
//
// Environment: `accentFg`, `textFg`, `textSecondaryFg`, `selectionBg` (TUI row
// background), `selectedClass` (web).

import { isSelected } from "./rows.js"

// Function: createBehaviors
// Builds the BookmarkRow behavior map for the given renderer environment.
function createBehaviors(env) {
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
