// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/web/catalogue
// Binds the shared component logic in `tcmd/components` to the web (`.html`)
// presentations using select.js. Requires a DOM; import this module only in a
// browser (or a happy-dom test environment).
//
// List rows are rendered with select.js's keyed `Component.map` primitive; the
// row behaviors are shared with the TUI presentation. Components sharing a
// presentation bind the same source (`Breadcrumbs`/`Toolbar` both use
// `RowList.html`).

import { ui } from "select/ui"
import commandPaletteHtml from "../components/CommandPalette.html" with { type: "text" }
import crumbHtml from "../components/Crumb.html" with { type: "text" }
import fileListHtml from "../components/FileList.html" with { type: "text" }
import filePreviewHtml from "../components/FilePreview.html" with { type: "text" }
import fileRowHtml from "../components/FileRow.html" with { type: "text" }
import paletteRowHtml from "../components/PaletteRow.html" with { type: "text" }
import rowListHtml from "../components/RowList.html" with { type: "text" }
import summaryHtml from "../components/Summary.html" with { type: "text" }
import toolItemHtml from "../components/ToolItem.html" with { type: "text" }

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
import { webTheme } from "./theme.js"

let registered = false

// Function: createComponents
// Binds every shared component to its `.html` presentation.
function createComponents() {
	const crumb = bind(ui, "Crumb", crumbHtml, crumbBehaviors(webTheme))
	const fileRow = bind(ui, "FileRow", fileRowHtml, fileRowBehaviors(webTheme))
	const toolItem = bind(ui, "ToolItem", toolItemHtml, toolItemBehaviors(webTheme))
	const paletteRow = bind(ui, "PaletteRow", paletteRowHtml, paletteRowBehaviors(webTheme))
	return {
		Crumb: crumb,
		FileRow: fileRow,
		ToolItem: toolItem,
		PaletteRow: paletteRow,
		Breadcrumbs: bind(ui, "Breadcrumbs", rowListHtml, breadcrumbsBehaviors({
			...webTheme,
			listClass: "breadcrumbs",
			rows: crumbRows(crumb),
		})),
		CommandPalette: bind(ui, "CommandPalette", commandPaletteHtml, commandPaletteBehaviors({
			...webTheme,
			rows: paletteRows(paletteRow),
		})),
		FileList: bind(ui, "FileList", fileListHtml, fileListBehaviors({
			...webTheme,
			rows: fileRows(fileRow),
		})),
		FilePreview: bind(ui, "FilePreview", filePreviewHtml, filePreviewBehaviors(webTheme)),
		Summary: bind(ui, "Summary", summaryHtml, summaryBehaviors(webTheme)),
		Toolbar: bind(ui, "Toolbar", rowListHtml, toolbarBehaviors({
			...webTheme,
			listClass: "toolbar",
			rows: toolItemRows(toolItem),
		})),
	}
}

const components = createComponents()

// Function: registerWebComponents
// Idempotent registration of the parent components as select.js formatters, so
// App.html can resolve `out="...|Name"` processors.
function registerWebComponents() {
	if (registered) return components
	registered = true
	ui.format("Breadcrumbs", components.Breadcrumbs)
	ui.format("CommandPalette", components.CommandPalette)
	ui.format("FileList", components.FileList)
	ui.format("FilePreview", components.FilePreview)
	ui.format("Summary", components.Summary)
	ui.format("Toolbar", components.Toolbar)
	return components
}

export { components, registerWebComponents }

// EOF
