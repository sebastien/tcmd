// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-02

// Module: tcmd/components/Help
// Shared behavior for the `?` key reference overlay, plus the reference data
// itself. The categories are built from the live keymap and command registry,
// so they cannot drift from the actual bindings, and every entry reuses the
// command bar's own bracket shorthand (`[Open ⏎]`) with the key in the accent
// colour — so the reference reads exactly like the bottom bar. The rows are
// laid out in two columns balanced by line count, the section headings are
// uppercase and bright, and every bracket is padded to one width so the keys
// line up down each column. Both presentations (`Help.xml` / `Help.html`)
// render the same row data through `HelpRow`.

import { unwrap } from "select/state/cells"
import { DEFAULT_KEYMAP, keyGlyph } from "../core/keymap.js"
import { getCommands } from "../core/commands.js"
import { commandLabel, keyGlyph as keyLabelGlyph } from "./CommandItem.js"

// Constant: BRACKET
// The shorthand delimiters, shared with the command bar.
const OPEN = "["
const CLOSE = "]"

// Constant: CLOSE_HINT
// The footer shorthand: Esc dismisses the overlay.
const CLOSE_HINT = { title: "Close", keys: "Esc" }

// Constant: BOLD
// OpenTUI's `TextAttributes.BOLD` bit, set on section headings through the
// TUI's `out:attributes` slot. The web bolds through CSS instead.
const BOLD = 1

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

// Function: helpGroups
// The categorized key reference as `{ title, rows }` groups in display order.
// One row per command, with every distinct chord from the live keymap. The
// registry provides the action title; the keymap remains authoritative for the
// displayed bindings, including aliases and modifiers.
function helpGroups() {
	const byId = new Map(getCommands().map((command) => [command.id, command]))
	const groups = new Map()
	for (const binding of DEFAULT_KEYMAP) {
		const command = byId.get(binding.command)
		if (!command) continue
		const group = binding.command.split(".")[0]
		if (!groups.has(group)) groups.set(group, new Map())
		const rows = groups.get(group)
		if (!rows.has(binding.command)) rows.set(binding.command, { keys: [], id: binding.command, title: command.title })
		const row = rows.get(binding.command)
		const glyph = keyGlyph(binding)
		if (!row.keys.includes(glyph)) row.keys.push(glyph)
	}
	const out = []
	for (const group of GROUP_ORDER) {
		const rows = groups.get(group)
		if (!rows) continue
		const list = []
		for (const row of rows.values()) {
			list.push({ id: row.id, title: row.title, keys: row.keys.map(keyLabelGlyph).join("/") })
		}
		out.push({ title: GROUP_TITLES[group] ?? group, rows: list })
	}
	return out
}

// Function: helpLines
// The flat reference: group headings and rows, one per line, blank line
// between groups (the single-column fallback).
function helpLines() {
	const lines = []
	for (const group of helpGroups()) {
		lines.push(group.title)
		for (const row of group.rows) lines.push(commandLabel(row).trim())
		lines.push("")
	}
	return lines
}

// Function: helpBlocks
// The reference split into two columns balanced by line count, as flat lists of
// renderable blocks: `{ type: "section", label }` headings,
// `{ type: "entry", open, head, keys, close }` rows and `{ type: "spacer" }`
// blank lines between groups. Every entry title and key is padded to the widest
// one across both columns, so all brackets share one width and the keys align
// down each column (keys right-aligned against the closing bracket).
function helpBlocks() {
	const groups = helpGroups()
	let titleWidth = 0
	let keyWidth = 0
	for (const group of groups) {
		for (const row of group.rows) {
			titleWidth = Math.max(titleWidth, row.title.length)
			keyWidth = Math.max(keyWidth, keyLabelGlyph(row.keys).length)
		}
	}
	const columns = [[], []]
	const loads = [0, 0]
	for (const group of groups) {
		const at = loads[0] <= loads[1] ? 0 : 1
		columns[at].push({ type: "section", key: `section:${group.title}`, label: group.title.toUpperCase() })
		for (const row of group.rows) {
			columns[at].push({
				type: "entry",
				key: `entry:${row.id}`,
				open: OPEN,
				head: `${row.title.padEnd(titleWidth)} `,
				keys: keyLabelGlyph(row.keys).padStart(keyWidth),
				close: CLOSE,
			})
		}
		// A blank row separates the groups (and costs one line, like the
		// heading).
		columns[at].push({ type: "spacer", key: `spacer:${group.title}` })
		// A group costs its rows plus its heading and the blank after it.
		loads[at] += group.rows.length + 2
	}
	// The blank line separates groups, so the bottom of each column ends on its
	// last entry instead.
	for (const column of columns) {
		if (column[column.length - 1]?.type === "spacer") column.pop()
	}
	return { left: columns[0], right: columns[1] }
}

// Function: createBehaviors
// Builds the Help behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		bg: () => env.theme.surfaceBg,
		borderFg: () => env.theme.borderPrimaryActiveFg,
		dimFg: () => env.theme.textSecondaryFg,
		leftRows: (self, data) => env.rows?.(self, data, "left") ?? [],
		rightRows: (self, data) => env.rows?.(self, data, "right") ?? [],
		// The reference has no cursor for the scrollbox to follow, so its
		// vertical bar is driven here: visible only while the two columns
		// actually overflow the viewport. The viewport height is derived from
		// the injected `size` (so the bar tracks a resize) and the dialog's own
		// geometry (`Help.xml`: 82% tall, minus padding, borders, rule and
		// footer).
		scrollbar: (self, data) => {
			const scroll = self?.ref?.scroll
			const bar = scroll?.verticalScrollBar
			if (!bar) return ""
			const height = unwrap(data?.size)?.height ?? self?.ctx?.height ?? 0
			const viewport = height > 0 ? Math.floor(height * 0.82) - 6 : 0
			const columns = helpBlocks()
			const rows = Math.max(columns.left.length, columns.right.length)
			const want = viewport > 0 && rows > viewport
			if (bar.visible !== want) bar.visible = want
			return ""
		},
		open: (_self, data) => Boolean(unwrap(data.open)),
		// The footer shorthand reads like the bar: dim brackets, bright title,
		// accent key.
		hintOpen: () => OPEN,
		hintHead: () => `${CLOSE_HINT.title} `,
		hintKeys: () => CLOSE_HINT.keys,
		hintClose: () => CLOSE,
		bracketFg: () => env.theme.textSecondaryFg,
		headFg: () => env.theme.textFg,
		keyFg: () => env.theme.accentFg,
		// Separator rule above the footer (a top border on a one-row box).
		rule: () => ["top"],
		ruleFg: () => env.theme.textSecondaryFg,
		textFg: () => env.theme.textFg,
		title: () => " Keys ",
		titleFg: () => env.theme.textHeadingFg,
	}
}

// Function: createRowBehaviors
// Builds the HelpRow behavior map (one section heading or one key entry).
function createRowBehaviors(env) {
	return {
		isSection: (_self, data) => data.item?.type === "section",
		isEntry: (_self, data) => data.item?.type === "entry",
		section: (_self, data) => data.item?.label ?? "",
		// Sections are bright; the TUI adds bold via OpenTUI's attribute bit
		// (the web bolds through CSS instead).
		sectionFg: () => env.theme.textHeadingFg,
		sectionAttrs: () => BOLD,
		open: (_self, data) => data.item?.open ?? "",
		head: (_self, data) => data.item?.head ?? "",
		keys: (_self, data) => data.item?.keys ?? "",
		close: (_self, data) => data.item?.close ?? "",
		bracketFg: () => env.theme.textSecondaryFg,
		headFg: () => env.theme.textFg,
		keyFg: () => env.theme.accentFg,
	}
}

export { createBehaviors, createRowBehaviors, helpBlocks, helpGroups, helpLines, keyGlyph }

// EOF
