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
import commandBarXml from "../components/CommandBar.xml" with { type: "text" }
import commandItemXml from "../components/CommandItem.xml" with { type: "text" }
import commandPaletteXml from "../components/CommandPalette.xml" with { type: "text" }
import confirmXml from "../components/Confirm.xml" with { type: "text" }
import crumbXml from "../components/Crumb.xml" with { type: "text" }
import fileListXml from "../components/FileList.xml" with { type: "text" }
import filePreviewXml from "../components/FilePreview.xml" with { type: "text" }
import fileRowXml from "../components/FileRow.xml" with { type: "text" }
import filterBarXml from "../components/FilterBar.xml" with { type: "text" }
import helpXml from "../components/Help.xml" with { type: "text" }
import paletteRowXml from "../components/PaletteRow.xml" with { type: "text" }
import rowListXml from "../components/RowList.xml" with { type: "text" }
import summaryXml from "../components/Summary.xml" with { type: "text" }
import tabBarXml from "../components/TabBar.xml" with { type: "text" }
import tabItemXml from "../components/TabItem.xml" with { type: "text" }

import {
	bind,
	breadcrumbsBehaviors,
	commandBarBehaviors,
	commandItemBehaviors,
	commandItemRows,
	commandPaletteBehaviors,
	confirmBehaviors,
	crumbBehaviors,
	crumbRows,
	fileListBehaviors,
	filePreviewBehaviors,
	fileRowBehaviors,
	fileRows,
	filterBarBehaviors,
	paletteRowBehaviors,
	paletteRows,
	summaryBehaviors,
	tabBarBehaviors,
	tabItemBehaviors,
	tabItemRows,
} from "../components/index.js"
import { createBehaviors as helpBehaviors } from "./help.js"
import { INSPECTOR_INLINE_WIDTH } from "./frame.js"
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
		frameBorderFg: tuiTheme.frameBorderFg,
		lineFg: tuiTheme.dimFg,
		markFg: tuiTheme.markFg,
		paletteBg: tuiTheme.paletteBg,
		panelBg: tuiTheme.panelBg,
		selectedBg: tuiTheme.selectedBg,
		textFg: tuiTheme.textFg,
		titleFg: tuiTheme.titleFg,
	}
}

// Function: measure
// Display width of a string, counting wide CJK/emoji cells as two.
function measure(text) {
	return globalThis.Bun?.stringWidth ? globalThis.Bun.stringWidth(text) : `${text}`.length
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

// Keep the scrollbox cursor row inside the viewport.
function fileListScrollTop(self, data) {
	return keepVisible(self.ref.list, unwrap(data.cursor) ?? 0, unwrap(data.entries)?.length ?? 0)
}

// Keep the palette selection inside its viewport.
function paletteScrollTop(self, data) {
	return keepVisible(self.ref.list, unwrap(data.selected) ?? 0, unwrap(data.items)?.length ?? 0)
}

// Constant: BAR_COMPACT
// The command-bar hints kept on narrow viewports. The rest stay reachable from
// the command palette and the `?` reference.
const BAR_COMPACT = new Set([
	"pane.enter",
	"pane.up",
	"pane.toggle",
	"list.mark",
	"view.togglePreview",
	"palette.toggle",
	"filter.start",
])

// Function: commandBarRows
// Trims the command bar to its essential hints when the viewport is narrow.
function commandBarRows(commandItem) {
	const base = commandItemRows(commandItem)
	return (data) => {
		const items = unwrap(data.items) ?? []
		const compact = Boolean(unwrap(data.compact))
		// Context hint sets (palette/filter) carry no command id; never trim
		// those, only the command set.
		const isHintSet = items.some((item) => item?.id === null || item?.id === undefined)
		const kept = compact && !isHintSet ? items.filter((item) => BAR_COMPACT.has(item.id)) : items
		return base({ ...data, items: kept })
	}
}

// Function: createComponents
// Binds every shared component to its `.xml` presentation.
function createComponents() {
	const env = tuiEnv()
	const commandItem = bind(ui, "CommandItem", commandItemXml, commandItemBehaviors(env))
	const crumb = bind(ui, "Crumb", crumbXml, crumbBehaviors(env))
	const fileRow = bind(ui, "FileRow", fileRowXml, fileRowBehaviors(env))
	const filterBar = bind(ui, "FilterBar", filterBarXml, filterBarBehaviors(env))
	const paletteRow = bind(ui, "PaletteRow", paletteRowXml, paletteRowBehaviors(env))
	const tabItem = bind(ui, "TabItem", tabItemXml, tabItemBehaviors(env))
	return {
		CommandItem: commandItem,
		Crumb: crumb,
		FileRow: fileRow,
		PaletteRow: paletteRow,
		TabItem: tabItem,
		Breadcrumbs: bind(ui, "Breadcrumbs", rowListXml, breadcrumbsBehaviors({
			...env,
			rows: crumbRows(crumb),
		})),
		CommandBar: bind(ui, "CommandBar", commandBarXml, commandBarBehaviors({
			...env,
			rows: commandBarRows(commandItem),
		})),
		CommandPalette: bind(ui, "CommandPalette", commandPaletteXml, commandPaletteBehaviors({
			...env,
			rows: paletteRows(paletteRow),
			scrollTop: paletteScrollTop,
		})),
		Confirm: bind(ui, "Confirm", confirmXml, confirmBehaviors(env)),
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
			// The box width is unresolved when the behavior first runs, so fall
			// back to an estimate from the viewport (panes share it, minus the
			// inspector when inline). The next render uses the real width.
			width: (self) => {
				const own = Math.floor(self.ref.box?.width ?? 0)
				if (own > 0) return own
				const total = Math.floor(self.ctx?.width ?? 0)
				if (total <= 0) return 0
				const columns = total >= INSPECTOR_INLINE_WIDTH ? 3 : 2
				return Math.max(12, Math.floor(total / columns) - 6)
			},
			measure,
			elide: (text, width) => {
				if (width < 12 || measure(text) <= width) return text
				return `${text.slice(0, Math.max(0, width - 1))}…`
			},
		})),
		TabBar: bind(ui, "TabBar", tabBarXml, tabBarBehaviors({
			...env,
			rows: tabItemRows(tabItem),
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
		commandbar: components.CommandBar,
		commandpalette: components.CommandPalette,
		confirm: components.Confirm,
		filelist: components.FileList,
		filepreview: components.FilePreview,
		filterbar: components.FilterBar,
		help: components.Help,
		summary: components.Summary,
		tabbar: components.TabBar,
	})
	return components
}

export { components, keepVisible, registerComponents }

// EOF
