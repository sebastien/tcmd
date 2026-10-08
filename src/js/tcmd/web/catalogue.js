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
// presentation bind the same source (`Breadcrumbs` uses `RowList.html`).

import { ui } from "select/ui"
import bookmarkListHtml from "../components/BookmarkList.html" with { type: "text" }
import bookmarkRowHtml from "../components/BookmarkRow.html" with { type: "text" }
import commandBarHtml from "../components/CommandBar.html" with { type: "text" }
import commandItemHtml from "../components/CommandItem.html" with { type: "text" }
import commandPaletteHtml from "../components/CommandPalette.html" with { type: "text" }
import confirmHtml from "../components/Confirm.html" with { type: "text" }
import crumbHtml from "../components/Crumb.html" with { type: "text" }
import entryDetailHtml from "../components/EntryDetail.html" with { type: "text" }
import fileListHtml from "../components/FileList.html" with { type: "text" }
import filePreviewHtml from "../components/FilePreview.html" with { type: "text" }
import fileRowHtml from "../components/FileRow.html" with { type: "text" }
import filterBarHtml from "../components/FilterBar.html" with { type: "text" }
import headerHtml from "./header.html" with { type: "text" }
import paneLabelHtml from "../components/PaneLabel.html" with { type: "text" }
import paletteRowHtml from "../components/PaletteRow.html" with { type: "text" }
import rowListHtml from "../components/RowList.html" with { type: "text" }
import summaryHtml from "../components/Summary.html" with { type: "text" }

import {
	bind,
	bookmarkListBehaviors,
	bookmarkRowBehaviors,
	bookmarkRows,
	breadcrumbsBehaviors,
	commandBarBehaviors,
	commandItemBehaviors,
	commandItemRows,
	commandPaletteBehaviors,
	confirmBehaviors,
	crumbBehaviors,
	crumbRows,
	entryDetailBehaviors,
	fileListBehaviors,
	filePreviewBehaviors,
	fileRowBehaviors,
	fileRows,
	filterBarBehaviors,
	paneLabelBehaviors,
	paletteRowBehaviors,
	paletteRows,
	summaryBehaviors,
} from "../components/index.js"
import { createBehaviors as headerBehaviors } from "./header.js"
import { webTheme } from "./theme.js"

let registered = false

// Advance width of one monospace cell, cached from the header's computed font.
let charWidth = 0

// Function: columnWidth
// Columns available in `el`, measured from the monospace advance width. Returns
// 0 when the DOM cannot measure (happy-dom, no layout), disabling compression.
// ponytail: measured per render; a pure viewport resize waits for the next one.
function columnWidth(el) {
	const px = el?.clientWidth || el?.ownerDocument?.defaultView?.innerWidth || 0
	if (!px) return 0
	const view = el.ownerDocument?.defaultView
	if (!view) return 0
	if (!charWidth) {
		try {
			const ctx = el.ownerDocument.createElement("canvas").getContext("2d")
			const style = view.getComputedStyle(el)
			ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
			charWidth = ctx.measureText("0").width || 0
		} catch {
			return 0
		}
	}
	return charWidth ? Math.floor(px / charWidth) : 0
}

// Function: createComponents
// Binds every shared component to its `.html` presentation.
function createComponents() {
	const commandItem = bind(ui, "CommandItem", commandItemHtml, commandItemBehaviors(webTheme))
	const crumb = bind(ui, "Crumb", crumbHtml, crumbBehaviors(webTheme))
	const fileRow = bind(ui, "FileRow", fileRowHtml, fileRowBehaviors(webTheme))
	const filterBar = bind(ui, "FilterBar", filterBarHtml, filterBarBehaviors(webTheme))
	const paletteRow = bind(ui, "PaletteRow", paletteRowHtml, paletteRowBehaviors(webTheme))
	const bookmarkRow = bind(ui, "BookmarkRow", bookmarkRowHtml, bookmarkRowBehaviors(webTheme))
	return {
		BookmarkRow: bookmarkRow,
		CommandItem: commandItem,
		Crumb: crumb,
		FileRow: fileRow,
		PaletteRow: paletteRow,
		Breadcrumbs: bind(ui, "Breadcrumbs", rowListHtml, breadcrumbsBehaviors({
			...webTheme,
			listClass: "breadcrumbs",
			rows: crumbRows(crumb),
		})),
		BookmarkList: bind(ui, "BookmarkList", bookmarkListHtml, bookmarkListBehaviors({
			...webTheme,
			rows: bookmarkRows(bookmarkRow),
		})),
		CommandBar: bind(ui, "CommandBar", commandBarHtml, commandBarBehaviors({
			...webTheme,
			listClass: "command-bar-keys",
			rows: commandItemRows(commandItem),
		})),
		CommandPalette: bind(ui, "CommandPalette", commandPaletteHtml, commandPaletteBehaviors({
			...webTheme,
			rows: paletteRows(paletteRow),
		})),
		Confirm: bind(ui, "Confirm", confirmHtml, confirmBehaviors(webTheme)),
		EntryDetail: bind(ui, "EntryDetail", entryDetailHtml, entryDetailBehaviors(webTheme)),
		FileList: bind(ui, "FileList", fileListHtml, fileListBehaviors({
			...webTheme,
			rows: fileRows(fileRow),
		})),
		FilePreview: bind(ui, "FilePreview", filePreviewHtml, filePreviewBehaviors(webTheme)),
		FilterBar: filterBar,
		Header: bind(ui, "Header", headerHtml, headerBehaviors({
			...webTheme,
			width: (self) => columnWidth(self.ref.box),
		})),
		PaneLabel: bind(ui, "PaneLabel", paneLabelHtml, paneLabelBehaviors(webTheme)),
		Summary: bind(ui, "Summary", summaryHtml, summaryBehaviors(webTheme)),
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
	ui.format("BookmarkList", components.BookmarkList)
	ui.format("CommandBar", components.CommandBar)
	ui.format("CommandPalette", components.CommandPalette)
	ui.format("Confirm", components.Confirm)
	ui.format("EntryDetail", components.EntryDetail)
	ui.format("FileList", components.FileList)
	ui.format("FilePreview", components.FilePreview)
	ui.format("FilterBar", components.FilterBar)
	ui.format("Header", components.Header)
	ui.format("PaneLabel", components.PaneLabel)
	ui.format("Summary", components.Summary)
	return components
}

export { components, registerWebComponents }

// EOF
