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
//   [Open ⏎]   — the brackets in the dim text colour, the title in the text
//                colour, the key glyph in the accent (primary) or secondary
//                accent, and a trailing space separating it from the next
//                entry. Entries are separated by that space alone — no
//                divider glyph.
//
// Entries without a key (the marked count) render as a dimmed plain word
// with no brackets. The web renders the same label as a single string.
//
// Environment: `accentFg` (primary), `accentSecondaryFg` (secondary),
// `textFg`, `textSecondaryFg`.

// Function: keyGlyph
// The shorthand glyph for a shortcut label: ⏎ for Enter, ⇥ for Tab.
function keyGlyph(keys) {
	if (!keys) return keys
	const GLYPHS = { Enter: "⏎", "↵": "⏎", Tab: "⇥" }
	return keys
		.split("/")
		.map((key) => GLYPHS[key] ?? (key.endsWith("Tab") ? `${key.slice(0, -3)}⇥` : key))
		.join("/")
}

// Function: commandLabel
// "[Open ⏎] " style label; entries without a key are just a plain word.
function commandLabel(item) {
	if (!item) return ""
	return item.keys ? `[${item.title} ${keyGlyph(item.keys)}] ` : `${item.title} `
}

// Function: commandWidth
// Columns the entry occupies: its label, brackets and trailing space included.
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
	return {
		// Web: the whole shorthand as one label.
		itemLabel: (_self, data) => commandLabel(data.item),
		itemHint: (_self, data) => !data.item?.id,
		// TUI: the dim brackets around the bright title, then the accent key
		// glyph and the closer. Keyless entries (the marked count) render as a
		// plain dim word, with no brackets.
		itemOpen: (_self, data) => (data.item?.keys ? "[" : ""),
		itemOpenFg: () => env?.textSecondaryFg,
		itemHead: (_self, data) => `${data.item?.title ?? ""} `,
		itemFg: (_self, data) => (data.item?.keys ? env?.textFg : env?.textSecondaryFg),
		keyText: (_self, data) => (data.item?.keys ? keyGlyph(data.item.keys) : ""),
		keyFg: (_self, data) => (isPrimary(data.item) ? env?.accentFg : env?.accentSecondaryFg),
		itemClose: (_self, data) => (data.item?.keys ? "] " : ""),
		itemCloseFg: () => env?.textSecondaryFg,
	}
}

export { commandLabel, commandWidth, createBehaviors, isPrimary, keyGlyph }

// EOF
