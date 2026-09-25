// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/views/command-palette
// CommandPalette: popup listing commands filtered by the typed query. The
// input is focused while open (`out:focused`), typing filters `paletteItems`
// live; the app runs the highlighted command on Enter.
//
// Data expected in scope:
// - `open` (cell of boolean), `query` (cell of string, two-way),
// - `items` (cell of [{ id, title, keys }]), `index` (cell of number).

import { ui } from "select.tui"
import { theme } from "../theme.js"

function readValue(value) {
	return value?.isReactive ? value.value : value
}

const CommandPalette = ui(`
	<box when="open" position="absolute" bottom="0" left="0" width="100%" height="8"
	     out:backgroundColor="bg" border title="palette" titleFg="titleFg" flexDirection="column">
		<input ref="query" inout="query" height="1" out:focused="focused" on:enter="confirm"></input>
		<box flexGrow="1" flexDirection="column">
			<box each="items" flexDirection="row" height="1" on:click="item.id!palette:run">
				<text out="paletteLabel" out:fg="rowFg"></text>
			</box>
		</box>
	</box>
`)
	.does({
		bg: () => theme.paletteBg,
		confirm: (self, data) => self.pub("palette:confirm", readValue(data.query) ?? ""),
		// The input takes focus while the palette is open.
		focused: (_self, data) => Boolean(readValue(data.open)),
		paletteLabel: (_self, data) => `${data.item.title} [${data.item.keys}]`,
		rowFg: (_self, data) =>
			data.index === (readValue(data.index) ?? 0) ? theme.accentFg : theme.textFg,
		titleFg: () => theme.titleFg,
	})

export { CommandPalette }

// EOF
