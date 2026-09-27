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
// `rows` environment. Components sharing a presentation bind the same source
// (`Breadcrumbs`/`Toolbar` both use `RowList.xml`).

import { extend, ui } from "select.tui"
import { unwrap } from "select/state/cells"
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
	bind,
	breadcrumbsBehaviors,
	commandPaletteBehaviors,
	crumbBehaviors,
	crumbRows,
	fileListBehaviors,
	filePreviewBehaviors,
	fileRowBehaviors,
	fileRows,
	paletteRowBehaviors,
	paletteRows,
	summaryBehaviors,
	toolbarBehaviors,
	toolItemBehaviors,
	toolItemRows,
} from "../components/index.js"
import { tuiTheme } from "./theme.js"

let registered = false

// Function: tuiEnv
// The TUI renderer environment: OpenTUI colors plus TUI-only hooks.
function tuiEnv() {
	return {
		accentFg: tuiTheme.accentFg,
		borderFg: tuiTheme.borderFg,
		cursorBg: tuiTheme.cursorBg,
		dimFg: tuiTheme.dimFg,
		dirFg: tuiTheme.dirFg,
		errorFg: tuiTheme.errorFg,
		lineFg: tuiTheme.dimFg,
		markFg: tuiTheme.markFg,
		paletteBg: tuiTheme.paletteBg,
		textFg: tuiTheme.textFg,
		titleFg: tuiTheme.titleFg,
	}
}

// Keep the scrollbox cursor row inside the viewport.
function fileListScrollTop(self, data) {
	const box = self.ref.list
	if (!box || !box.height) return box?.scrollTop ?? 0
	const cursor = unwrap(data.cursor) ?? 0
	const view = Math.max(1, Math.floor(box.height))
	const top = box.scrollTop ?? 0
	if (cursor < top) return cursor
	if (cursor >= top + view) return cursor - view + 1
	return top
}

// Function: createComponents
// Binds every shared component to its `.xml` presentation.
function createComponents() {
	const env = tuiEnv()
	const crumb = bind(ui, "Crumb", crumbXml, crumbBehaviors(env))
	const fileRow = bind(ui, "FileRow", fileRowXml, fileRowBehaviors(env))
	const toolItem = bind(ui, "ToolItem", toolItemXml, toolItemBehaviors(env))
	const paletteRow = bind(ui, "PaletteRow", paletteRowXml, paletteRowBehaviors(env))
	return {
		Crumb: crumb,
		FileRow: fileRow,
		ToolItem: toolItem,
		PaletteRow: paletteRow,
		Breadcrumbs: bind(ui, "Breadcrumbs", rowListXml, breadcrumbsBehaviors({
			...env,
			rows: crumbRows(crumb),
		})),
		CommandPalette: bind(ui, "CommandPalette", commandPaletteXml, commandPaletteBehaviors({
			...env,
			rows: paletteRows(paletteRow),
		})),
		FileList: bind(ui, "FileList", fileListXml, fileListBehaviors({
			...env,
			rows: fileRows(fileRow),
			scrollTop: fileListScrollTop,
		})),
		FilePreview: bind(ui, "FilePreview", filePreviewXml, filePreviewBehaviors(env)),
		Summary: bind(ui, "Summary", summaryXml, summaryBehaviors({
			...env,
			width: (self) => Math.floor(self.ref.box?.width ?? 0),
			elide: (text, width) =>
				width >= 12 && text.length > width ? `${text.slice(0, width - 1)}…` : text,
		})),
		Toolbar: bind(ui, "Toolbar", rowListXml, toolbarBehaviors({
			...env,
			rows: toolItemRows(toolItem),
		})),
	}
}

const components = createComponents()

// Function: registerComponents
// Idempotent registration of the parent components as select.tui host tags.
function registerComponents() {
	if (registered) return components
	registered = true
	extend({
		breadcrumbs: components.Breadcrumbs,
		commandpalette: components.CommandPalette,
		filelist: components.FileList,
		filepreview: components.FilePreview,
		summary: components.Summary,
		toolbar: components.Toolbar,
	})
	return components
}

export { components, registerComponents }

// EOF
