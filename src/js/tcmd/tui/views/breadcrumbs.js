// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/views/breadcrumbs
// PathBreadcruss: clickable path elements for one pane. Publishes
// `crumbs:go` with `{ paneId, path }` when a segment is clicked.
//
// Data expected in scope: `segments` (cell of [{ name, path }]), `paneId`.

import { ui } from "select.tui"
import { theme } from "../theme.js"

const Breadcrumbs = ui(`
	<box each="segments" flexDirection="row" height="1" on:click="path:item.path,paneId:paneId!crumbs:go">
		<text out="crumbLabel" out:fg="crumbFg"></text>
	</box>
`)
	.does({
		// Root crumb renders as "[/]"; the rest as "name /".
		crumbLabel: (_self, data) => (data.item.path === "/" ? "[/] " : `${data.item.name} / `),
		crumbFg: (_self, data) => (data.item.path === "/" ? theme.dimFg : theme.titleFg),
	})

export { Breadcrumbs }

// EOF
