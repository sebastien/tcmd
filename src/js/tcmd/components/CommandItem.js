// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/CommandItem
// Command-bar entry behaviors. Read `{ item, index }`, the same bag shape in
// both engines. `item.id` may be null for pure key hints, in which case a
// click dispatches nothing.
//
// The TUI renders each entry as a Yazi-style Powerline pill. The command
// title (`OP`) is the accent block with dark text on it, the shortcut
// (`KEY`) is the accent drawn on a neutral grey, and Powerline caps bound the
// two segments:
//
//   opLeft: the accent cap on the grey  (the pill's rounded left edge)
//   op:     dark accent text on the accent block
//   mid:    the accent cap on the grey  (the accent -> shortcut edge)
//   key:    the accent text on the grey block
//   end:    the grey cap on the default (the pill's rounded right edge)
//
// A cap takes the foreground of the block it leaves and the background of the
// block it enters, so the accent tapers into the grey and the grey back into
// the terminal default. The web renders a single label.
//
// Environment: `accentFg`/`accentBg` (primary), `accentSecondaryFg`/
// `accentSecondaryBg` (secondary), `mutedBg` (the neutral grey). The accent
// foreground picks the block/cap colour; the accent background is the dark
// ink drawn on the block.

// Function: commandLabel
// "Open[Enter] " style label; hints without a key are just the title.
function commandLabel(item) {
	if (!item) return ""
	return item.keys ? `${item.title}[${item.keys}] ` : `${item.title} `
}

// Function: commandTitle
// The pill's title segment, padded so the accent block reads as a chip.
function commandTitle(item) {
	if (!item) return ""
	return ` ${item.title} `
}

// Function: commandKeys
// The pill's shortcut segment, padded like the title.
function commandKeys(item) {
	if (!item) return ""
	return item.keys ? ` ${item.keys} ` : ""
}

const PILL_LEFT = ""
const PILL_RIGHT = ""

// Function: isPrimary
// True when the item is its context's most important action.
function isPrimary(item) {
	return Boolean(item?.primary)
}

// Function: accentBlock
// The bright accent fill for the item: primary or secondary. Yazi's mode
// background, and the colour the caps and the shortcut draw with.
function accentBlock(env, item) {
	return isPrimary(item) ? env?.accentFg : env?.accentSecondaryFg
}

// Function: accentInk
// The dark text drawn on the accent block, so the title contrasts against the
// bright fill (Yazi's black-on-mode background).
function accentInk(env, item) {
	return isPrimary(item) ? env?.accentBg : env?.accentSecondaryBg
}

// Function: createBehaviors
// Builds the CommandItem behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		itemLabel: (_self, data) => commandLabel(data.item),
		// TUI pill, modelled on Yazi's status bar. `opLeft`/`mid`/`end` are
		// the Powerline caps; `op` is the accent block, `key` the grey block.
		// A cap's foreground is the block it leaves, its background the block
		// it enters: opLeft opens the accent out of the grey, `mid` carries
		// the accent into the grey, `end` closes the grey to the terminal
		// default. The OP text is neutral, the KEY text is the accent (Yazi's
		// "alt" style: accent on grey).
		opLeft: (_self, data) => (data.item?.keys ? PILL_LEFT : ""),
		opLeftFg: (_self, data) => accentBlock(env, data.item),
		opLeftBg: () => env?.mutedBg,
		op: (_self, data) => commandTitle(data.item),
		opFg: (_self, data) => accentInk(env, data.item),
		opBg: (_self, data) => accentBlock(env, data.item),
		mid: (_self, data) => (data.item?.keys ? PILL_RIGHT : ""),
		midFg: (_self, data) => accentBlock(env, data.item),
		midBg: () => env?.mutedBg,
		key: (_self, data) => commandKeys(data.item),
		keyFg: (_self, data) => accentBlock(env, data.item),
		keyBg: () => env?.mutedBg,
		end: (_self, data) => (data.item?.keys ? PILL_RIGHT : ""),
		endFg: () => env?.mutedBg,
		endBg: () => undefined,
	}
}

export { commandKeys, commandLabel, commandTitle, createBehaviors, isPrimary }

// EOF
