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
// The workspace chrome (`Frame.js`) and the key reference (`Help.js`) are
// shared logic bound here to their `.xml` presentations; the browser view
// binds the same modules to `.html`.

import { extend, getTags, ui } from "select.tui"
import { unwrap } from "select/state/cells"
import bookmarkListXml from "../components/BookmarkList.xml" with { type: "text" }
import bookmarkRowXml from "../components/BookmarkRow.xml" with { type: "text" }
import commandBarXml from "../components/CommandBar.xml" with { type: "text" }
import commandArgRowXml from "../components/CommandArgRow.xml" with { type: "text" }
import commandItemXml from "../components/CommandItem.xml" with { type: "text" }
import commandPanelXml from "../components/CommandPanel.xml" with { type: "text" }
import confirmXml from "../components/Confirm.xml" with { type: "text" }
import crumbXml from "../components/Crumb.xml" with { type: "text" }
import entryDetailXml from "../components/EntryDetail.xml" with { type: "text" }
import fileListXml from "../components/FileList.xml" with { type: "text" }
import filePickerXml from "../components/FilePicker.xml" with { type: "text" }
import filePickerRowXml from "../components/FilePickerRow.xml" with { type: "text" }
import filePreviewXml from "../components/FilePreview.xml" with { type: "text" }
import fileRowXml from "../components/FileRow.xml" with { type: "text" }
import filterBarXml from "../components/FilterBar.xml" with { type: "text" }
import helpXml from "../components/Help.xml" with { type: "text" }
import helpRowXml from "../components/HelpRow.xml" with { type: "text" }
import overlayListXml from "../components/OverlayList.xml" with { type: "text" }
import overlayRowXml from "../components/OverlayRow.xml" with { type: "text" }
import rowListXml from "../components/RowList.xml" with { type: "text" }
import summaryXml from "../components/Summary.xml" with { type: "text" }

import {
	bind,
	bookmarkListBehaviors,
	bookmarkRowBehaviors,
	bookmarkRows,
	breadcrumbsBehaviors,
	commandBarBehaviors,
	commandBarFit,
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
	filePickerBehaviors,
	filePickerRowBehaviors,
	filePickerRows,
	filePreviewBehaviors,
	fileRowBehaviors,
	fileRows,
	filterBarBehaviors,
	helpRowBehaviors,
	helpRows,
	iconsEnabled,
	listingWindow,
	overlayListBehaviors,
	overlayRowBehaviors,
	overlayRows,
	panelArgRows,
	panelOpRows,
	panelRunRows,
	summaryBehaviors,
} from "../components/index.js"
import { createBehaviors as helpBehaviors } from "../components/Help.js"
import { INSPECTOR_INLINE_WIDTH } from "../components/Frame.js"
import { CodeRenderable, ImageRenderable, pathToFiletype, createTextAttributes } from "./opentui.js"
import { syntaxStyle } from "./syntax.js"
import { tuiTheme } from "./theme.js"

let registered = false

// Class: CodeView
// The `code` host tag: OpenTUI's tree-sitter `CodeRenderable` with the shared
// `SyntaxStyle` injected, because the renderable reads its style at
// construction time and a template attribute can only carry a string. Content
// and `filetype` still arrive through the node's own `out:` bindings.
class CodeView extends CodeRenderable {
	constructor(ctx, options) {
		super(ctx, { ...options, syntaxStyle: options.syntaxStyle ?? syntaxStyle() })
	}
}

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
		execFg: tuiTheme.execFg,
		fieldBg: tuiTheme.fieldBg,
		fileFg: tuiTheme.fileFg,
		groupAttributes: createTextAttributes({ bold: true }),
		// Resolves an entry path to a tree-sitter filetype (undefined when no
		// bundled parser matches, and the preview then draws plain text).
		filetype: (path) => pathToFiletype(path),
		// Raster formats the `image` renderable decodes. `bmp`/`svg` are not
		// among them, so those previews keep the metadata card.
		imageExts: ["gif", "jpeg", "jpg", "png", "webp"],
		// Nerd Font icons in rows, on unless `TCMD_ICONS` opts out.
		icons: iconsEnabled(process.env),
		lineFg: tuiTheme.textSecondaryFg,
		linkFg: tuiTheme.linkFg,
		mutedBg: tuiTheme.mutedBg,
		overlayBg: tuiTheme.overlayBg,
		readonlyFg: tuiTheme.readonlyFg,
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

// Keep the file-list cursor row inside the viewport. The window comes from
// `listingWindow`, the same helper the row builder uses, so the scrollbox
// content and the scroll keeper never disagree (a windowed pane scrolls the
// cursor inside its window; an inspector without a threaded viewport mounts
// the full listing and scrolls it by absolute index).
function fileListScrollTop(self, data) {
	const { local, len } = listingWindow(data, unwrap(data.viewport) ?? 0)
	return keepVisible(self.ref.list, local, len)
}

// Keep the file picker's cursor row inside its viewport, using the same
// bounded window as the row builder.
function filePickerScrollTop(self, data) {
	const rows = unwrap(data.rows) ?? []
	const cursor = unwrap(data.cursor) ?? 0
	const { local, len } = listingWindow({ entries: rows, cursor }, 0)
	return keepVisible(self.ref.list, local, len)
}

// Keep the bookmark picker selection inside its viewport.
function bookmarkScrollTop(self, data) {
	return keepVisible(self.ref.list, unwrap(data.selected) ?? 0, unwrap(data.items)?.length ?? 0)
}

// Keep the shared list overlay's cursor inside its viewport.
function overlayScrollTop(self, data) {
	return keepVisible(self.ref.list, unwrap(data.cursor) ?? 0, unwrap(data.items)?.length ?? 0)
}

// Keep the selected command visible in the command panel's scrolling list.
function panelOpScrollTop(self, data) {
	const items = unwrap(data.items) ?? []
	const cursor = unwrap(data.opCursor) ?? 0
	const index = items.findIndex((item) => item.type === "op" && item.entryIndex === cursor)
	const box = self.ref.ops
	// OpenTUI's measured scrollbox height includes two clipped edge cells in a
	// modal, so scroll against the visible content height rather than the frame.
	const visibleBox = box?.height
		? { height: Math.max(1, Math.floor(box.height) - 2), scrollTop: box.scrollTop, scrollHeight: box.scrollHeight }
		: box
	return keepVisible(visibleBox, Math.max(0, index), items.length)
}

// Keep enough vertical room for the trailing Run row on compact terminals while
// retaining the usual shorter panel on a full-sized viewport.
function panelDialogHeight(self) {
	const height = Math.floor(self.ctx?.height ?? 0)
	if (!height) return "72%"
	return Math.floor(height * (height <= 20 ? 0.85 : 0.72))
}

// Keep the command panel's argument cursor inside its viewport. Argument
// headers are two lines tall and a selection's item run gains a border row at
// each end, so the offset is measured in rendered lines rather than row
// indices.
function panelArgScrollTop(self, data) {
	// Arguments, the preflight preview and Run share the argument scroller;
	// the mapping must count the preview and Run's leading blank line so the
	// cursor can still be kept in view at the bottom.
	const rows = unwrap(data.rows) ?? []
	const box = self.ref.args
	if (!rows.length) return box?.scrollTop ?? 0
	const cursor = Math.min(unwrap(data.argCursor) ?? 0, rows.length - 1)
	const previewHeight = unwrap(data.preview) ? (self.ref.previewBox?.height ?? 0) : 0
	let offset = 0
	let cursorTop = 0
	let cursorHeight = 1
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		// Run is preceded by the preview (when there is one) and by its own
		// one-line separation from the last field.
		if (row.type === "run") offset += 1 + previewHeight
		const firstItem = row.type === "item" && (i === 0 || rows[i - 1].type !== "item")
		const lastItem = row.type === "item" && (i === rows.length - 1 || rows[i + 1].type !== "item")
		if (firstItem) offset += 1
		const height = row.type === "arg" ? 2 : 1
		if (i === cursor) {
			cursorTop = offset
			cursorHeight = height
		}
		offset += height
		if (lastItem) offset += 1
	}
	return keepRangeVisible(box, cursorTop, cursorHeight, offset)
}

// Function: keepRangeVisible
// The line-based counterpart of `keepVisible`: keeps the `[top, top + height)`
// run inside the scrollbox, then nudges one line at the same edge margins.
function keepRangeVisible(box, top, height, total) {
	if (!box || !box.height) return box?.scrollTop ?? 0
	const view = Math.max(1, Math.floor(box.height))
	const maxTop = Math.max(0, total - view)
	let scroll = Math.max(0, Math.min(box.scrollTop ?? 0, maxTop))
	if (top < scroll) scroll = top
	else if (top + height > scroll + view) scroll = top + height - view
	const position = top - scroll
	if (position > SCROLL_HIGH * view && scroll < maxTop) scroll += 1
	else if (position < SCROLL_LOW * view && scroll > 0) scroll -= 1
	return scroll
}

// Function: commandBarRows
// Appends the active pane's marked count as a trailing dimmed entry, fits the
// entries on one line (dropping what does not fit behind an ellipsis), then
// maps them to rows.
function commandBarRows(commandItem) {
	const base = commandItemRows(commandItem)
	return (self, data) => {
		const viewport = unwrap(data.uiSize)
		const viewportWidth = Math.floor(viewport?.width ?? 0)
		// Prefer the injected viewport: the box geometry still reports the
		// previous width on the frame a resize arrives.
		const own = Math.floor(self.ref.box?.width ?? 0)
		const width = viewportWidth > 0 ? viewportWidth - 1 : own
		const items = unwrap(data.items) ?? []
		const marks = commandBarMarksItem(data)
		const entries = marks ? [...items, marks] : items
		return base(self, { ...data, items: commandBarFit(entries, width) })
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
	const filePickerRow = bind(ui, "FilePickerRow", filePickerRowXml, filePickerRowBehaviors(env))
	const filterBar = bind(ui, "FilterBar", filterBarXml, filterBarBehaviors(env))
	const bookmarkRow = bind(ui, "BookmarkRow", bookmarkRowXml, bookmarkRowBehaviors(env))
	const overlayRow = bind(ui, "OverlayRow", overlayRowXml, overlayRowBehaviors(env))
	const helpRow = bind(ui, "HelpRow", helpRowXml, helpRowBehaviors({ theme: tuiTheme }))
	return {
		BookmarkRow: bookmarkRow,
		CommandArgRow: commandArgRow,
		CommandItem: commandItem,
		Crumb: crumb,
		FileRow: fileRow,
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
			panelHeight: panelDialogHeight,
			opRows: panelOpRows(commandArgRow),
			argRows: panelArgRows(commandArgRow),
			runRows: panelRunRows(commandArgRow),
			opScrollTop: panelOpScrollTop,
			argScrollTop: panelArgScrollTop,
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
		FilePicker: bind(ui, "FilePicker", filePickerXml, filePickerBehaviors({
			...env,
			rows: filePickerRows(filePickerRow),
			scrollTop: filePickerScrollTop,
		})),
		FilePreview: bind(ui, "FilePreview", filePreviewXml, filePreviewBehaviors(env)),
		FilterBar: filterBar,
		Help: bind(ui, "Help", helpXml, helpBehaviors({ theme: tuiTheme, rows: helpRows(helpRow) })),
		OverlayList: bind(ui, "OverlayList", overlayListXml, overlayListBehaviors({
			...env,
			rows: overlayRows(overlayRow),
			scrollTop: overlayScrollTop,
		})),
		Summary: bind(ui, "Summary", summaryXml, summaryBehaviors({
			...env,
			width: paneWidth,
			measure,
			elide,
		})),
	}
}

const components = createComponents()

// Function: showScrollBar
// select.tui hides scrollbars by default because cursor-aware lists keep the
// cursor on screen themselves. Restore automatic overflow visibility for every
// scrollbox; the wrapper width fix lets the vertical bar fit beside its content.
function showScrollBar(node) {
	// The wrapper's content declares a 100% minimum width, which otherwise
	// starves the 1-column bar and drops it over the first column. The wrapper
	// is re-measured once the content is mounted, so apply it again on the next
	// tick to land on the overlay's first frame.
	const fix = () => {
		if (node.wrapper) node.wrapper.minWidth = 0
		node.requestRender?.()
	}
	fix()
	queueMicrotask(fix)
	const bar = node.verticalScrollBar
	if (bar) {
		bar.width = 1
		bar.flexShrink = 0
		// The slider's default track/thumb are greys; the theme keeps the
		// scrollbar part of the night-blue surfaces (mono leaves the defaults).
		if (bar.slider && tuiTheme.scrollbarThumbBg) {
			bar.slider.backgroundColor = tuiTheme.scrollbarTrackBg
			bar.slider.foregroundColor = tuiTheme.scrollbarThumbBg
		}
	}
}

// Function: registerComponents
// Idempotent registration of the parent components as select.tui host tags.
function registerComponents() {
	if (registered) return components
	registered = true
	extend({
		// Preserve OpenTUI's scrollbox while re-enabling its overflow-aware bars.
		scrollbox: { Class: getTags().scrollbox.Class, configure: showScrollBar },
		helpscroll: { Class: getTags().scrollbox.Class, configure: showScrollBar },
		bookmarklist: components.BookmarkList,
		breadcrumbs: components.Breadcrumbs,
		// Tree-sitter code preview (see `CodeView`) and the Kitty/sixel/blocks
		// image renderable; `filepreview` binds both.
		code: { Class: CodeView, contentProp: "content" },
		image: { Class: ImageRenderable },
		commandbar: components.CommandBar,
		commandpanel: components.CommandPanel,
		confirm: components.Confirm,
		entrydetail: components.EntryDetail,
		filelist: components.FileList,
		filepicker: components.FilePicker,
		filepreview: components.FilePreview,
		filterbar: components.FilterBar,
		help: components.Help,
		overlaylist: components.OverlayList,
		summary: components.Summary,
	})
	return components
}

export { components, fileListScrollTop, keepVisible, panelDialogHeight, panelOpScrollTop, registerComponents }

// EOF
