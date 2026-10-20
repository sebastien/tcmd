// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-20

// Module: tcmd/components/FilePickerRow
// One entry in the file picker. The row presentation deliberately mirrors the
// file panes (`FileRow`): marker, kind icon, name and right-aligned size. It
// only overrides the `..` parent row (no trailing slash) and its click event,
// which the command panel routes back through `panel:select`.

import { createBehaviors as fileRowBehaviors, rowName as fileRowName } from "./FileRow.js"

// Function: createBehaviors
// Builds the FilePickerRow behavior map from the shared FileRow behaviors.
function createBehaviors(env) {
	const behaviors = fileRowBehaviors(env)
	return {
		...behaviors,
		rowName: (_self, data) => (data.item?.isParent ? ".." : fileRowName(data.item)),
		rowSize: (_self, data) => (data.item?.isParent ? "" : behaviors.rowSize?.(_self, data) ?? ""),
		rowType: (_self, data) => (data.item?.isParent ? "parent" : data.item?.type ?? "entry"),
		rowHref: (_self, data) => data.key ?? data.item?.path ?? "",
	}
}

export { createBehaviors }
