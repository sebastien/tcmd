// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-14

// Module: tcmd/components/CommandField
// One inline textual-argument field on the command panel's command row: a dim
// argument name followed by its value — read-only, or an input while the field
// owns the keyboard. Reads the row bag `{ item, index, focused, value }` built
// by `rows.js#panelFieldRows`; `item` is a descriptor from
// `core/panel#panelFieldList` and `value` is the panel's shared edit cell.
//
// Environment: `textFg` (a filled value), `textSecondaryFg` (the name and an
// empty value), `focusedClass` (web).

// Function: fieldValue
// The trimmed value of a field descriptor ("" when empty).
function fieldValue(item) {
	return `${item?.value ?? ""}`.trim()
}

// Function: createBehaviors
// Builds the CommandField behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		// A focused field takes the leftover width so its input is comfortable;
		// the others shrink to their content.
		boxGrow: (_self, data) => (data.focused === true ? 1 : 0),
		editing: (_self, data) => data.focused === true,
		fieldClass: (_self, data) => (data.focused ? env.focusedClass : null),
		focused: (_self, data) => data.focused === true,
		name: (_self, data) => `${data.item?.name ?? ""}`,
		nameFg: () => env.textSecondaryFg,
		// An empty field shows a dim `(empty)` placeholder; a filled one its
		// value in the normal text colour.
		text: (_self, data) => fieldValue(data.item) || "(empty)",
		textFg: (_self, data) => (fieldValue(data.item) ? env.textFg : env.textSecondaryFg),
	}
}

export { createBehaviors, fieldValue }
