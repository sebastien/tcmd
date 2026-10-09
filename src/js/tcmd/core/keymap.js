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
	{ key: "pageup", command: "nav.pageUp" },
	{ key: "pagedown", command: "nav.pageDown" },
	{ key: "home", command: "nav.home" },
	{ key: "end", command: "nav.end" },
	{ key: "right", command: "pane.enter" },
	{ key: "return", command: "pane.enter" },
	{ key: "enter", command: "pane.enter" },
	{ key: "left", command: "pane.up" },
	{ key: "backspace", command: "pane.up" },
	{ key: "tab", command: "pane.toggle" },
	{ key: "tab", shift: true, command: "pane.toggle" },
	{ key: "space", command: "list.mark" },
	{ key: "b", command: "bookmark.record" },
	{ key: "g", command: "bookmark.jump" },
	{ key: "m", command: "panel.toggle" },
	{ key: ":", command: "panel.open" },
	{ key: "!", command: "palette.run" },
	{ key: "/", command: "filter.start" },
	{ key: "r", ctrl: true, command: "pane.reload" },
	{ key: "v", command: "view.togglePreview" },
	{ key: "o", shift: true, command: "file.open" },
	{ key: "e", shift: true, command: "file.edit" },
	{ key: "p", ctrl: true, command: "palette.toggle" },
	{ key: "q", command: "app.quit" },
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

export { DEFAULT_KEYMAP, matchKeymap }

// EOF
