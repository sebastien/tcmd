// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/catalogue
// Binds the shared component logic in `tcmd/components` to the TUI (`.xml`)
// presentations and registers them with the select.tui catalogue. Tags in
// templates are matched case-insensitively by select.tui.
//
// List rows are rendered with the same `Component.map` primitive as the web:
// each row component (`.xml`) is bound here and referenced by its parent's
// `rows` environment.

import { extend, ui } from "select.tui"
import commandPaletteXml from "../components/CommandPalette.xml" with { type: "text" }
import crumbXml from "../components/Crumb.xml" with { type: "text" }
import fileListXml from "../components/FileList.xml" with { type: "text" }
import filePreviewXml from "../components/FilePreview.xml" with { type: "text" }
import fileRowXml from "../components/FileRow.xml" with { type: "text" }
import paletteRowXml from "../components/PaletteRow.xml" with { type: "text" }
import rowListXml from "../components/RowList.xml" with { type: "text" }
import summaryXml from "../components/Summary.xml" with { type: "text" }
import toolItemXml from "../components/ToolItem.xml" with { type: "text" }

import {
	breadcrumbsBehaviors,
	breadcrumbRows,
	commandPaletteBehaviors,
	crumbBehaviors,
	fileListBehaviors,
	filePreviewBehaviors,
	fileRowBehaviors,
	fileRows,
	paletteRowBehaviors,
	paletteRows,
	read,
	summaryBehaviors,
	toolbarBehaviors,
	toolItemBehaviors,
	toolRows,
} from "../components/index.js"
import { theme } from "./theme.js"

let registered = false

// Function: bind
// Binds a definition and behavior map to a template source.
function bind(name, template, behaviors) {
	return ui.component(name).does(behaviors).using(template)
}

// Function: tuiEnv
// The TUI renderer environment: OpenTUI colors plus TUI-only hooks.
function tuiEnv() {
	return {
		accentFg: theme.accentFg,
		borderFg: theme.borderFg,
		cursorBg: theme.cursorBg,
		dimFg: theme.dimFg,
		dirFg: theme.dirFg,
		errorFg: theme.errorFg,
		markFg: theme.markFg,
		paletteBg: theme.paletteBg,
		textFg: theme.textFg,
		titleFg: theme.titleFg,
	}
}

// Keep the scrollbox cursor row inside the viewport.
function fileListScrollTop(self, data) {
	const box = self.ref.list
	if (!box || !box.height) return box?.scrollTop ?? 0
	const cursor = read(data.cursor) ?? 0
	const view = Math.max(1, Math.floor(box.height))
	const top = box.scrollTop ?? 0
	if (cursor < top) return cursor
	if (cursor >= top + view) return cursor - view + 1
	return top
}

// Function: registerComponents
// Idempotent component registration; imported for its side effect by the app.
function registerComponents() {
	if (registered) return catalogueTags()
	registered = true
	const env = tuiEnv()

	// Row components (each with its own `.xml` presentation).
	const crumb = bind("Crumb", crumbXml, crumbBehaviors(env))
	const fileRow = bind("FileRow", fileRowXml, fileRowBehaviors(env))
	const toolItem = bind("ToolItem", toolItemXml, toolItemBehaviors(env))
	const paletteRow = bind("PaletteRow", paletteRowXml, paletteRowBehaviors(env))

	extend({
		breadcrumbs: bind("Breadcrumbs", rowListXml, breadcrumbsBehaviors({
			...env,
			rows: breadcrumbRows(crumb),
		})),
		commandpalette: bind("CommandPalette", commandPaletteXml, commandPaletteBehaviors({
			...env,
			rows: paletteRows(paletteRow),
		})),
		filelist: bind("FileList", fileListXml, fileListBehaviors({
			...env,
			rows: fileRows(fileRow),
			scrollTop: fileListScrollTop,
		})),
		filepreview: bind("FilePreview", filePreviewXml, filePreviewBehaviors(env)),
		summary: bind("Summary", summaryXml, summaryBehaviors({
			...env,
			width: (self) => Math.floor(self.ref.box?.width ?? 0),
			elide: (text, width) =>
				width >= 12 && text.length > width ? `${text.slice(0, width - 1)}…` : text,
		})),
		toolbar: bind("Toolbar", rowListXml, toolbarBehaviors({
			...env,
			rows: toolRows(toolItem),
		})),
	})
	return catalogueTags()
}

function catalogueTags() {
	return ["breadcrumbs", "commandpalette", "filelist", "filepreview", "summary", "toolbar"]
}

export { registerComponents }
