// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-17

// Module: tcmd/components/OverlayRow
// One row of the shared list overlay (`u` history / `⇧T` trash). Reads
// `{ item: { text, meta, dim }, index, currentRow }`; the builder snapshots the
// overlay cursor into a plain `currentRow` boolean, with the shared `cursor`
// cell as fallback for hand-built bags.
//
// Environment: `accentSecondaryFg`, `textFg`, `textSecondaryFg`,
// `textHeadingFg`, `cursorBg` (current row background), `currentClass` (web).

import { unwrap } from "select/state/cells"

// Function: rowCurrent
// Whether the row is the overlay cursor: the plain `currentRow` flag wins over
// the shared `cursor` cell.
function rowCurrent(data) {
	if (data.currentRow !== undefined) return data.currentRow === true
	return data.index === unwrap(data.cursor)
}

// Function: createBehaviors
// Builds the OverlayRow behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		rowBg: (_self, data) => (rowCurrent(data) ? env.cursorBg : undefined),
		rowClass: (_self, data) => (rowCurrent(data) ? env.currentClass : null),
		rowCurrent: (_self, data) => `${rowCurrent(data)}`,
		rowDim: (_self, data) => `${Boolean(data.item?.dim)}`,
		rowMarker: (_self, data) => (rowCurrent(data) ? "> " : "  "),
		rowMarkerFg: () => env.accentSecondaryFg,
		rowText: (_self, data) => data.item?.text ?? "",
		// The cursor row reads bright; an undone/dim row (a superseded history
		// entry) takes the secondary colour, like a hint.
		rowTextFg: (_self, data) =>
			rowCurrent(data) ? env.textHeadingFg : data.item?.dim ? env.textSecondaryFg : env.textFg,
		rowMeta: (_self, data) => data.item?.meta ?? "",
		rowMetaFg: () => env.textSecondaryFg,
	}
}

export { createBehaviors, rowCurrent }

// EOF
