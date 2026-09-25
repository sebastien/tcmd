// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/views/toolbar
// Toolbar: labeled operations with their keyboard shortcuts, generated from
// the command registry. Publishes `toolbar:run` with the command id.
//
// Data expected in scope: `commands` (cell of [{ id, title, keys }]).

import { ui } from "select.tui"
import { theme } from "../theme.js"

const Toolbar = ui(`
	<box each="commands" flexDirection="row" height="1" on:click="item.id!toolbar:run">
		<text out="toolLabel" out:fg="toolFg"></text>
	</box>
`)
	.does({
		toolFg: (_self, data) => (data.index === 0 ? theme.accentFg : theme.dimFg),
		toolLabel: (_self, data) => `${data.item.title}[${data.item.keys}] `,
	})

export { Toolbar }

// EOF
