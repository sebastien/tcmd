// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/keymap
// Key chord to command-id mapping. A chord is `{ name, ctrl?, meta?, shift? }`
// as delivered by OpenTUI key events. Matching is first-match-wins.

const DEFAULT_KEYMAP = [
	{ key: "up", command: "nav.up" },
	{ key: "down", command: "nav.down" },
	{ key: "up", ctrl: true, command: "nav.jumpUp" },
	{ key: "down", ctrl: true, command: "nav.jumpDown" },
	{ key: "pageup", command: "nav.pageUp" },
	{ key: "pagedown", command: "nav.pageDown" },
	{ key: "home", command: "nav.home" },
	{ key: "end", command: "nav.end" },
	{ key: "right", command: "pane.enter" },
	{ key: "return", command: "pane.enter" },
	{ key: "enter", command: "pane.enter" },
	{ key: "left", command: "pane.up" },
	{ key: "backspace", command: "pane.up" },
	{ key: "escape", command: "pane.back" },
	{ key: "escape", shift: true, command: "pane.forward" },
	{ key: "tab", command: "pane.toggle" },
	{ key: "tab", shift: true, command: "pane.toggle" },
	{ key: "space", command: "list.mark" },
	{ key: "b", command: "bookmark.record" },
	{ key: "g", command: "bookmark.jump" },
	{ key: ":", command: "panel.open" },
	{ key: "!", command: "panel.shell" },
	{ key: "/", command: "filter.start" },
	{ key: "r", ctrl: true, command: "pane.reload" },
	{ key: "v", command: "view.togglePreview" },
	{ key: "v", shift: true, command: "view.maximize" },
	{ key: "t", command: "view.toggleMode" },
	{ key: "t", shift: true, command: "trash.open" },
	{ key: "n", command: "file.mkdir" },
	{ key: "u", command: "history.open" },
	{ key: "z", ctrl: true, command: "history.undo" },
	{ key: "z", ctrl: true, shift: true, command: "history.redo" },
	{ key: "y", ctrl: true, command: "history.redo" },
	{ key: "o", shift: true, command: "file.open" },
	{ key: "e", shift: true, command: "file.edit" },
	{ key: "q", command: "app.quit" },
	{ key: "?", command: "app.help" },
]

// Function: matchKeymap
// Returns the command id for `chord`, or `null` when nothing matches.
function matchKeymap(keymap, chord) {
	if (!chord?.name) return null
	for (let i = 0; i < keymap.length; i++) {
		const binding = keymap[i]
		if (binding.key !== chord.name) continue
		if (Boolean(binding.ctrl) !== Boolean(chord.ctrl)) continue
		if (Boolean(binding.meta) !== Boolean(chord.meta)) continue
		if (Boolean(binding.shift) !== Boolean(chord.shift)) continue
		return binding.command
	}
	return null
}

// Function: keyGlyph
// Human-readable label for a keymap chord ("↑", "⇧Tab", "^W", "PgUp").
function keyGlyph(chord) {
	const name = chord.key
	const named = {
		up: "↑",
		down: "↓",
		left: "←",
		right: "→",
		return: "↵",
		enter: "↵",
		space: "Space",
		tab: "Tab",
		pageup: "PgUp",
		pagedown: "PgDn",
		escape: "Esc",
		backspace: "Bksp",
		home: "Home",
		end: "End",
	}
	let base = named[name] ?? (name.length === 1 ? name.toUpperCase() : `${name}`)
	if (chord.ctrl) base = `^${base}`
	if (chord.meta) base = `⌘${base}`
	if (chord.shift) base = `⇧${base}`
	return base
}

export { DEFAULT_KEYMAP, keyGlyph, matchKeymap }

// EOF
