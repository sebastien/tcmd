// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/CommandItem
// Command-bar entry behaviors. Read `{ item, index }`, the same bag shape in
// both engines. `item.id` may be null for pure key hints, in which case a
// click dispatches nothing.
//
// Environment: `accentFg`, `dimFg`.

// Function: commandLabel
// "Open[Enter] " style label; hints without a key are just the title.
function commandLabel(item) {
	if (!item) return ""
	return item.keys ? `${item.title}[${item.keys}] ` : `${item.title} `
}

// Function: createBehaviors
// Builds the CommandItem behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		itemFg: (_self, data) => (data.item?.id ? env?.accentFg : env?.dimFg),
		itemLabel: (_self, data) => commandLabel(data.item),
	}
}

export { commandLabel, createBehaviors }

// EOF
