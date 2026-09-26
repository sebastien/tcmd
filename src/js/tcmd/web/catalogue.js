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
// row behaviors are shared with the TUI presentation.

import { ui } from "select/ui"
import breadcrumbsHtml from "../components/Breadcrumbs.html" with { type: "text" }
import commandPaletteHtml from "../components/CommandPalette.html" with { type: "text" }
import crumbHtml from "../components/Crumb.html" with { type: "text" }
import fileListHtml from "../components/FileList.html" with { type: "text" }
import filePreviewHtml from "../components/FilePreview.html" with { type: "text" }
import fileRowHtml from "../components/FileRow.html" with { type: "text" }
import paletteRowHtml from "../components/PaletteRow.html" with { type: "text" }
import summaryHtml from "../components/Summary.html" with { type: "text" }
import toolItemHtml from "../components/ToolItem.html" with { type: "text" }
import toolbarHtml from "../components/Toolbar.html" with { type: "text" }

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
	summaryBehaviors,
	toolItemBehaviors,
	toolRows,
	toolbarBehaviors,
} from "../components/index.js"
import { webTheme } from "./theme.js"

// Row templates (reused by their parents' `rows` behaviors).
const Crumb = ui(crumbHtml).does(crumbBehaviors(webTheme))
const FileRow = ui(fileRowHtml).does(fileRowBehaviors(webTheme))
const ToolItem = ui(toolItemHtml).does(toolItemBehaviors(webTheme))
const PaletteRow = ui(paletteRowHtml).does(paletteRowBehaviors(webTheme))

// Parent components, each wiring the shared behaviors to its keyed row list.
const Toolbar = ui(toolbarHtml).does(
	toolbarBehaviors({
		...webTheme,
		rows: toolRows(ToolItem),
	}),
)

const Breadcrumbs = ui(breadcrumbsHtml).does(
	breadcrumbsBehaviors({
		...webTheme,
		rows: breadcrumbRows(Crumb),
	}),
)

const FileList = ui(fileListHtml).does(
	fileListBehaviors({
		...webTheme,
		rows: fileRows(FileRow),
	}),
)

const Summary = ui(summaryHtml).does(
	summaryBehaviors({ ...webTheme, width: () => 0, elide: (text) => text }),
)

const FilePreview = ui(filePreviewHtml).does(filePreviewBehaviors(webTheme))

const CommandPalette = ui(commandPaletteHtml).does(
	commandPaletteBehaviors({
		...webTheme,
		rows: paletteRows(PaletteRow),
	}),
)

// Function: registerWebComponents
// Registers the parent components as select.js formatters so App.html can
// resolve `out="...|Name"` processors.
function registerWebComponents() {
	ui.format("Toolbar", Toolbar)
	ui.format("Breadcrumbs", Breadcrumbs)
	ui.format("FileList", FileList)
	ui.format("Summary", Summary)
	ui.format("FilePreview", FilePreview)
	ui.format("CommandPalette", CommandPalette)
	return ui
}

export {
	Breadcrumbs,
	CommandPalette,
	Crumb,
	FileList,
	FilePreview,
	FileRow,
	PaletteRow,
	Summary,
	ToolItem,
	Toolbar,
	registerWebComponents,
}
