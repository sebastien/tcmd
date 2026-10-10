// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/CommandItem
// Command-bar entry behaviors. Read `{ item, index }`, the same bag shape in
// both engines. `item.id` may be null for pure key hints, in which case a
// click dispatches nothing.
//
// Each entry renders as a plain bracket shorthand:
//
//   [Open ⏎]   — the bracket and title in the text colour, the key glyph in
//                the accent (primary) or secondary accent, and a trailing
//                space separating it from the next entry.
//
// Entries without a key (the marked count) render as a dimmed plain word
// with no brackets. The web renders the same label as a single string.
//
// Environment: `accentFg` (primary), `accentSecondaryFg` (secondary),
// `textFg`, `textSecondaryFg`.

// Function: keyGlyph
// The shorthand glyph for a shortcut label: ⏎ for Enter, ⇥ for Tab.
function keyGlyph(keys) {
	const GLYPHS = { Enter: "⏎", "↵": "⏎", Tab: "⇥" }
	return GLYPHS[keys] ?? keys
}

// Function: commandLabel
// "[Open ⏎] " style label; entries without a key are just a plain word.
function commandLabel(item) {
	if (!item) return ""
	return item.keys ? `[${item.title} ${keyGlyph(item.keys)}] ` : `${item.title} `
}

// Function: commandWidth
// Columns the entry occupies, including its trailing space.
function commandWidth(item) {
	return commandLabel(item).length
}

// Function: isPrimary
// True when the item is its context's most important action.
function isPrimary(item) {
	return Boolean(item?.primary)
}

// Function: createBehaviors
// Builds the CommandItem behavior map for the given renderer environment.
function createBehaviors(env) {
	const head = (_self, data) => (data.item?.keys ? `[${data.item.title} ` : `${data.item?.title ?? ""} `)
	return {
		// Web: the whole shorthand as one label.
		itemLabel: (_self, data) => commandLabel(data.item),
		// TUI: the bracket + title head, the accent key glyph, the closer.
		itemHead: head,
		itemFg: (_self, data) => (data.item?.keys ? env?.textFg : env?.textSecondaryFg),
		keyText: (_self, data) => (data.item?.keys ? keyGlyph(data.item.keys) : ""),
		keyFg: (_self, data) => (isPrimary(data.item) ? env?.accentFg : env?.accentSecondaryFg),
		endText: (_self, data) => (data.item?.keys ? "] " : ""),
	}
}

export { commandLabel, commandWidth, createBehaviors, isPrimary, keyGlyph }

// EOF
