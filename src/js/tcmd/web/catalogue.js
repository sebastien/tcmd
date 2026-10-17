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
import { unwrap } from "select/state/cells"
import bookmarkListHtml from "../components/BookmarkList.html" with { type: "text" }
import bookmarkRowHtml from "../components/BookmarkRow.html" with { type: "text" }
import commandBarHtml from "../components/CommandBar.html" with { type: "text" }
import commandArgRowHtml from "../components/CommandArgRow.html" with { type: "text" }
import commandPanelHtml from "../components/CommandPanel.html" with { type: "text" }
import commandItemHtml from "../components/CommandItem.html" with { type: "text" }
import confirmHtml from "../components/Confirm.html" with { type: "text" }
import crumbHtml from "../components/Crumb.html" with { type: "text" }
import entryDetailHtml from "../components/EntryDetail.html" with { type: "text" }
import fileListHtml from "../components/FileList.html" with { type: "text" }
import filePreviewHtml from "../components/FilePreview.html" with { type: "text" }
import fileRowHtml from "../components/FileRow.html" with { type: "text" }
import filterBarHtml from "../components/FilterBar.html" with { type: "text" }
import helpHtml from "../components/Help.html" with { type: "text" }
import helpRowHtml from "../components/HelpRow.html" with { type: "text" }
import headerHtml from "./header.html" with { type: "text" }
import overlayListHtml from "../components/OverlayList.html" with { type: "text" }
import overlayRowHtml from "../components/OverlayRow.html" with { type: "text" }
import rowListHtml from "../components/RowList.html" with { type: "text" }
import summaryHtml from "../components/Summary.html" with { type: "text" }

import {
	bind,
	bookmarkListBehaviors,
	bookmarkRowBehaviors,
	bookmarkRows,
	breadcrumbsBehaviors,
	commandBarBehaviors,
	commandBarMarksItem,
	commandArgRowBehaviors,
	commandItemBehaviors,
	commandItemRows,
	commandPanelBehaviors,
	confirmBehaviors,
	crumbBehaviors,
	crumbRows,
	entryDetailBehaviors,
	fileListBehaviors,
	filePreviewBehaviors,
	fileRowBehaviors,
	fileRows,
	filterBarBehaviors,
	helpBehaviors,
	helpRowBehaviors,
	helpRows,
	overlayListBehaviors,
	overlayRowBehaviors,
	overlayRows,
	panelArgRows,
	panelOpRows,
	summaryBehaviors,
} from "../components/index.js"
import { createBehaviors as headerBehaviors } from "./header.js"
import { columnWidth } from "./effects.js"
import { webTheme } from "./theme.js"

let registered = false

// Function: paneWidth
// Reading the injected width cell keeps fitting reactive on pure resizes.
function paneWidth(self, data) {
	const width = unwrap(data.width) ?? 0
	return columnWidth(self.ref.box) || width
}

function elide(text, width) {
	return width > 0 && text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text
}

// Function: createComponents
// Binds every shared component to its `.html` presentation.
function createComponents() {
	const commandItem = bind(ui, "CommandItem", commandItemHtml, commandItemBehaviors(webTheme))
	// Keep command namespace markers textual; the bundled Nerd face is reserved
	// for filesystem names and paths.
	const commandArgRow = bind(ui, "CommandArgRow", commandArgRowHtml, commandArgRowBehaviors({
		...webTheme,
		icons: false,
	}))
	const crumb = bind(ui, "Crumb", crumbHtml, crumbBehaviors(webTheme))
	const fileRow = bind(ui, "FileRow", fileRowHtml, fileRowBehaviors(webTheme))
	const filterBar = bind(ui, "FilterBar", filterBarHtml, filterBarBehaviors(webTheme))
	const bookmarkRow = bind(ui, "BookmarkRow", bookmarkRowHtml, bookmarkRowBehaviors(webTheme))
	const overlayRow = bind(ui, "OverlayRow", overlayRowHtml, overlayRowBehaviors(webTheme))
	const helpRow = bind(ui, "HelpRow", helpRowHtml, helpRowBehaviors({ theme: webTheme }))
	return {
		BookmarkRow: bookmarkRow,
		CommandItem: commandItem,
		CommandArgRow: commandArgRow,
		Crumb: crumb,
		FileRow: fileRow,
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
			rows: (self, data) => {
				const marks = commandBarMarksItem(data)
				const items = unwrap(data.items) ?? []
				return commandItemRows(commandItem)(self, { ...data, items: marks ? [...items, marks] : items })
			},
		})),
		CommandPanel: bind(ui, "CommandPanel", commandPanelHtml, commandPanelBehaviors({
			...webTheme,
			opRows: panelOpRows(commandArgRow),
			argRows: panelArgRows(commandArgRow),
		})),
		Confirm: bind(ui, "Confirm", confirmHtml, confirmBehaviors(webTheme)),
		EntryDetail: bind(ui, "EntryDetail", entryDetailHtml, entryDetailBehaviors({ ...webTheme, width: paneWidth, elide })),
		FileList: bind(ui, "FileList", fileListHtml, fileListBehaviors({
			...webTheme,
			rows: fileRows(fileRow),
		})),
		FilePreview: bind(ui, "FilePreview", filePreviewHtml, filePreviewBehaviors({
			...webTheme,
			// Open/edit/run are TUI-only: the browser says so instead of
			// advertising keys it cannot honour.
			actions: () => " Open / edit are unavailable in the browser",
		})),
		FilterBar: filterBar,
		Help: bind(ui, "Help", helpHtml, helpBehaviors({ theme: webTheme, rows: helpRows(helpRow) })),
		Header: bind(ui, "Header", headerHtml, headerBehaviors(webTheme)),
		OverlayList: bind(ui, "OverlayList", overlayListHtml, overlayListBehaviors({
			...webTheme,
			rows: overlayRows(overlayRow),
		})),
		Summary: bind(ui, "Summary", summaryHtml, summaryBehaviors({ ...webTheme, width: paneWidth, elide })),
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
	ui.format("CommandPanel", components.CommandPanel)
	ui.format("Confirm", components.Confirm)
	ui.format("EntryDetail", components.EntryDetail)
	ui.format("FileList", components.FileList)
	ui.format("FilePreview", components.FilePreview)
	ui.format("FilterBar", components.FilterBar)
	ui.format("Header", components.Header)
	ui.format("Help", components.Help)
	ui.format("OverlayList", components.OverlayList)
	ui.format("Summary", components.Summary)
	return components
}

export { components, registerWebComponents }

// EOF
