// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-02

// Module: tcmd/components/Help
// Shared behavior for the `?` key reference overlay, plus the reference text
// itself (`helpLines`). The content is built from the live keymap and command
// registry, so it cannot drift from the actual bindings. Both presentations
// (`Help.xml` / `Help.html`) render the same lines.

import { unwrap } from "select/state/cells"
import { DEFAULT_KEYMAP } from "../core/keymap.js"
import { getCommands } from "../core/commands.js"

// Function: keyGlyph
// Human-readable glyph for a keymap chord ("↑", "⇧Tab", "^W", "PgUp").
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
	if (chord.shift && name !== "tab") base = `⇧${base}`
	return base
}

// Constant: GROUP_ORDER / GROUP_TITLES
// Help sections, in display order.
const GROUP_ORDER = ["nav", "pane", "list", "bookmark", "view", "file", "panel", "filter", "app"]
const GROUP_TITLES = {
	app: "Session",
	bookmark: "Bookmarks",
	file: "Files",
	filter: "Filter",
	list: "Selection",
	nav: "Navigation",
	panel: "Commands",
	pane: "Panes",
	view: "View",
}

// Function: helpLines
// The categorized key reference, one line per heading or binding.
function helpLines() {
	const byId = new Map(getCommands().map((command) => [command.id, command]))
	const groups = new Map()
	const seen = new Set()
	for (const binding of DEFAULT_KEYMAP) {
		const command = byId.get(binding.command)
		if (!command) continue
		const group = binding.command.split(".")[0]
		if (!groups.has(group)) groups.set(group, new Map())
		const rows = groups.get(group)
		if (!rows.has(binding.command)) rows.set(binding.command, { keys: [], title: command.title })
		const row = rows.get(binding.command)
		const glyph = keyGlyph(binding)
		if (!row.keys.includes(glyph) && !seen.has(`${binding.command}:${glyph}`)) {
			row.keys.push(glyph)
			seen.add(`${binding.command}:${glyph}`)
		}
	}
	const lines = []
	for (const group of GROUP_ORDER) {
		const rows = groups.get(group)
		if (!rows) continue
		lines.push(GROUP_TITLES[group] ?? group)
		for (const row of rows.values()) {
			lines.push(`  ${row.keys.join("/").padEnd(9)} ${row.title}`)
		}
		lines.push("")
	}
	return lines
}

// Function: createBehaviors
// Builds the Help behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		bg: () => env.theme.surfaceBg,
		borderFg: () => env.theme.borderPrimaryActiveFg,
		dimFg: () => env.theme.textSecondaryFg,
		hint: () => " Esc / ? close ",
		open: (_self, data) => Boolean(unwrap(data.open)),
		text: () => helpLines().join("\n"),
		textFg: () => env.theme.textFg,
		title: () => " Keys ",
		titleFg: () => env.theme.textHeadingFg,
	}
}

export { createBehaviors, helpLines, keyGlyph }

// EOF
