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
// (`Breadcrumbs` uses `RowList.xml`).
//
// TUI-only components (`Help`) live in `tui/` and are registered here only.

import { extend, ui } from "select.tui"
import { unwrap } from "select/state/cells"
import bookmarkListXml from "../components/BookmarkList.xml" with { type: "text" }
import bookmarkRowXml from "../components/BookmarkRow.xml" with { type: "text" }
import commandBarXml from "../components/CommandBar.xml" with { type: "text" }
import commandArgRowXml from "../components/CommandArgRow.xml" with { type: "text" }
import commandItemXml from "../components/CommandItem.xml" with { type: "text" }
import commandPanelXml from "../components/CommandPanel.xml" with { type: "text" }
import commandPaletteXml from "../components/CommandPalette.xml" with { type: "text" }
import confirmXml from "../components/Confirm.xml" with { type: "text" }
import crumbXml from "../components/Crumb.xml" with { type: "text" }
import entryDetailXml from "../components/EntryDetail.xml" with { type: "text" }
import fileListXml from "../components/FileList.xml" with { type: "text" }
import filePreviewXml from "../components/FilePreview.xml" with { type: "text" }
import fileRowXml from "../components/FileRow.xml" with { type: "text" }
import filterBarXml from "../components/FilterBar.xml" with { type: "text" }
import helpXml from "../components/Help.xml" with { type: "text" }
import paletteRowXml from "../components/PaletteRow.xml" with { type: "text" }
import rowListXml from "../components/RowList.xml" with { type: "text" }
import summaryXml from "../components/Summary.xml" with { type: "text" }

import {
	bind,
	bookmarkListBehaviors,
	bookmarkRowBehaviors,
	bookmarkRows,
	breadcrumbsBehaviors,
	commandBarBehaviors,
	commandArgRowBehaviors,
	commandItemBehaviors,
	commandItemRows,
	commandBarMarksItem,
	commandPanelBehaviors,
	commandPaletteBehaviors,
	confirmBehaviors,
	crumbBehaviors,
	crumbRows,
	entryDetailBehaviors,
	fileListBehaviors,
	filePreviewBehaviors,
	fileRowBehaviors,
	fileRows,
	fileWindow,
	filterBarBehaviors,
	iconsEnabled,
	paletteRowBehaviors,
	paletteRows,
	panelArgRows,
	panelOpRows,
	summaryBehaviors,
} from "../components/index.js"
import { createBehaviors as helpBehaviors } from "./help.js"
import { INSPECTOR_INLINE_WIDTH } from "./frame.js"
import { tuiTheme } from "./theme.js"

let registered = false

// Function: tuiEnv
// The TUI renderer environment: OpenTUI colors plus TUI-only hooks.
function tuiEnv() {
	return {
		accentBg: tuiTheme.accentBg,
		accentFg: tuiTheme.accentFg,
		accentSecondaryBg: tuiTheme.accentSecondaryBg,
		accentSecondaryFg: tuiTheme.accentSecondaryFg,
		borderPrimaryActiveFg: tuiTheme.borderPrimaryActiveFg,
		borderPrimaryFg: tuiTheme.borderPrimaryFg,
		borderSecondaryActiveFg: tuiTheme.borderSecondaryActiveFg,
		borderSecondaryFg: tuiTheme.borderSecondaryFg,
		cursorBg: tuiTheme.cursorBg,
		cursorInactiveBg: tuiTheme.cursorInactiveBg,
		devFg: tuiTheme.devFg,
		dirFg: tuiTheme.dirFg,
		errorBg: tuiTheme.errorBg,
		errorFg: tuiTheme.errorFg,
		fileFg: tuiTheme.fileFg,
		// Nerd Font icons in rows, on unless `TCMD_ICONS` opts out.
		icons: iconsEnabled(process.env),
		lineFg: tuiTheme.textSecondaryFg,
		linkFg: tuiTheme.linkFg,
		mutedBg: tuiTheme.mutedBg,
		overlayBg: tuiTheme.overlayBg,
		selectionBg: tuiTheme.selectionBg,
		surfaceBg: tuiTheme.surfaceBg,
		textFg: tuiTheme.textFg,
		textHeadingFg: tuiTheme.textHeadingFg,
		textSecondaryFg: tuiTheme.textSecondaryFg,
		tipBg: tuiTheme.tipBg,
		tipFg: tuiTheme.tipFg,
		warningBg: tuiTheme.warningBg,
		warningFg: tuiTheme.warningFg,
	}
}

// Function: measure
// Display width of a string, counting wide CJK/emoji cells as two.
function measure(text) {
	return globalThis.Bun?.stringWidth ? globalThis.Bun.stringWidth(text) : `${text}`.length
}

// Function: elide
// Truncate `text` to `width` columns with a trailing ellipsis.
function elide(text, width) {
	if (width < 12 || measure(text) <= width) return text
	return `${text.slice(0, Math.max(0, width - 1))}…`
}

// Function: paneWidth
// Content width of a pane from the instance box, falling back to a viewport
// estimate (panes share the width, minus the inspector when inline) because
// the box geometry is unresolved when a behavior first runs. The next render
// uses the real width.
function paneWidth(self) {
	const own = Math.floor(self.ref.box?.width ?? 0)
	if (own > 0) return own
	const total = Math.floor(self.ctx?.width ?? 0)
	if (total <= 0) return 0
	const columns = total >= INSPECTOR_INLINE_WIDTH ? 3 : 2
	return Math.max(12, Math.floor(total / columns) - 6)
}

// Edge fractions of the viewport kept as a scroll margin: the view nudges one
// line once the cursor enters the bottom or top quarter.
const SCROLL_LOW = 0.25
const SCROLL_HIGH = 0.75

// Keep the given row index inside the scrollbox viewport. A jump (PageUp/Down,
// Home/End, click) first clamps the view so the cursor stays visible; then, for
// line-by-line movement, the view scrolls one line at a time once the cursor is
// more than 75% down or less than 25% up, when more lines remain off-screen.
// `total` is the row count used to tell whether the view can still scroll.
function keepVisible(box, index, total) {
	if (process.env?.TCMD_SCROLL_DEBUG && box && box.height) {
		require("node:fs").appendFileSync(
			"/tmp/opencode/tcmd-scroll.log",
			`index=${index} total=${total} view=${Math.floor(box.height)} scrollTop=${box.scrollTop}\n`,
		)
	}
	if (!box || !box.height) return box?.scrollTop ?? 0
	const view = Math.max(1, Math.floor(box.height))
	const content = total ?? box.scrollHeight ?? view
	const maxTop = Math.max(0, content - view)
	let top = Math.max(0, Math.min(box.scrollTop ?? 0, maxTop))
	if (index < top) top = index
	else if (index >= top + view) top = index - view + 1
	const pos = index - top
	if (pos > SCROLL_HIGH * view && top < maxTop) top += 1
	else if (pos < SCROLL_LOW * view && top > 0) top -= 1
	return top
}

// Keep the file-list cursor row inside the viewport. When the list is windowed
// (a `viewport` height is threaded down) the scrollbox holds only the window,
// so it scrolls to the cursor's index inside that window against the window
// length; otherwise it scrolls the full listing.
function fileListScrollTop(self, data) {
	const viewport = unwrap(data.viewport)
	if (viewport > 0) {
		const { local, len } = fileWindow(data, viewport)
		return keepVisible(self.ref.list, local, len)
	}
	return keepVisible(self.ref.list, unwrap(data.cursor) ?? 0, unwrap(data.entries)?.length ?? 0)
}// Keep the palette selection inside its viewport.
function paletteScrollTop(self, data) {
	return keepVisible(self.ref.list, unwrap(data.selected) ?? 0, unwrap(data.items)?.length ?? 0)
}

// Keep the bookmark picker selection inside its viewport.
function bookmarkScrollTop(self, data) {
	return keepVisible(self.ref.list, unwrap(data.selected) ?? 0, unwrap(data.items)?.length ?? 0)
}

// Keep the command panel's argument cursor inside its viewport.
function panelArgScrollTop(self, data) {
	return keepVisible(self.ref.args, unwrap(data.argCursor) ?? 0, unwrap(data.rows)?.length ?? 0)
}

// Function: commandBarRows
// Appends the active pane's marked count as a trailing dimmed entry, then
// maps the items to rows. The entries wrap onto as many rows as the width
// demands; nothing is trimmed.
function commandBarRows(commandItem) {
	const base = commandItemRows(commandItem)
	return (self, data) => {
		const items = unwrap(data.items) ?? []
		const marks = commandBarMarksItem(data)
		return base(self, { ...data, items: marks ? [...items, marks] : items })
	}
}

// Function: createComponents
// Binds every shared component to its `.xml` presentation.
function createComponents() {
	const env = tuiEnv()
	const commandItem = bind(ui, "CommandItem", commandItemXml, commandItemBehaviors(env))
	const commandArgRow = bind(ui, "CommandArgRow", commandArgRowXml, commandArgRowBehaviors(env))
	const crumb = bind(ui, "Crumb", crumbXml, crumbBehaviors(env))
	const fileRow = bind(ui, "FileRow", fileRowXml, fileRowBehaviors(env))
	const filterBar = bind(ui, "FilterBar", filterBarXml, filterBarBehaviors(env))
	const paletteRow = bind(ui, "PaletteRow", paletteRowXml, paletteRowBehaviors(env))
	const bookmarkRow = bind(ui, "BookmarkRow", bookmarkRowXml, bookmarkRowBehaviors(env))
	return {
		BookmarkRow: bookmarkRow,
		CommandArgRow: commandArgRow,
		CommandItem: commandItem,
		Crumb: crumb,
		FileRow: fileRow,
		PaletteRow: paletteRow,
		Breadcrumbs: bind(ui, "Breadcrumbs", rowListXml, breadcrumbsBehaviors({
			...env,
			rows: crumbRows(crumb),
		})),
		BookmarkList: bind(ui, "BookmarkList", bookmarkListXml, bookmarkListBehaviors({
			...env,
			rows: bookmarkRows(bookmarkRow),
			scrollTop: bookmarkScrollTop,
		})),
		CommandBar: bind(ui, "CommandBar", commandBarXml, commandBarBehaviors({
			...env,
			rows: commandBarRows(commandItem),
		})),
		CommandPanel: bind(ui, "CommandPanel", commandPanelXml, commandPanelBehaviors({
			...env,
			opRows: panelOpRows(commandArgRow),
			argRows: panelArgRows(commandArgRow),
			argScrollTop: panelArgScrollTop,
		})),
		CommandPalette: bind(ui, "CommandPalette", commandPaletteXml, commandPaletteBehaviors({
			...env,
			rows: paletteRows(paletteRow),
			scrollTop: paletteScrollTop,
		})),
		Confirm: bind(ui, "Confirm", confirmXml, confirmBehaviors(env)),
		EntryDetail: bind(ui, "EntryDetail", entryDetailXml, entryDetailBehaviors({
			...env,
			width: paneWidth,
			measure,
			elide,
		})),
		FileList: bind(ui, "FileList", fileListXml, fileListBehaviors({
			...env,
			rows: fileRows(fileRow),
			scrollTop: fileListScrollTop,
		})),
		FilePreview: bind(ui, "FilePreview", filePreviewXml, filePreviewBehaviors(env)),
		FilterBar: filterBar,
		Help: bind(ui, "Help", helpXml, helpBehaviors({ theme: tuiTheme })),
		Summary: bind(ui, "Summary", summaryXml, summaryBehaviors({
			...env,
			width: paneWidth,
			measure,
			elide,
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
		bookmarklist: components.BookmarkList,
		breadcrumbs: components.Breadcrumbs,
		commandbar: components.CommandBar,
		commandpanel: components.CommandPanel,
		commandpalette: components.CommandPalette,
		confirm: components.Confirm,
		entrydetail: components.EntryDetail,
		filelist: components.FileList,
		filepreview: components.FilePreview,
		filterbar: components.FilterBar,
		help: components.Help,
		summary: components.Summary,
	})
	return components
}

export { components, fileListScrollTop, keepVisible, registerComponents }

// EOF
