// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/app
// Binds the shared App controller (`components/App.js`) to the web layout
// (`components/App.html`) and to the select.js `ui` runtime. Mirrors
// `tcmd/tui/app.js` for the DOM backend.

import { ui } from "select/ui"
import { cell, derived, unwrap } from "select/state/cells"
import appHtml from "../components/App.html" with { type: "text" }
import { appBehaviors, appEvents, appInit } from "../components/index.js"
import { registerWebComponents } from "./catalogue.js"
import { elideCrumbs } from "../components/format.js"
import { createFrameBehaviors, INSPECTOR_INLINE_WIDTH, isNarrow } from "../components/Frame.js"
import { connectEffects } from "./effects.js"
import { webTheme } from "./theme.js"

// Map DOM key names to the core keymap chord names.
const KEY_NAMES = {
	" ": "space",
	arrowdown: "down",
	arrowleft: "left",
	arrowright: "right",
	arrowup: "up",
	enter: "return",
}

function normalizeKey(event) {
	const raw = `${event?.key ?? ""}`.toLowerCase()
	const name = KEY_NAMES[raw] ?? raw
	// Terminals deliver shifted punctuation (`:`, `!`) as the character
	// itself, so the keymap matches those without the shift modifier; named
	// keys (Tab, arrows) and letters keep their shift state.
	const isPunctuation = name.length === 1 && !/[a-z0-9]/.test(name)
	const shift = Boolean(event?.shiftKey) && !isPunctuation
	return {
		name,
		ctrl: Boolean(event?.ctrlKey),
		meta: Boolean(event?.metaKey),
		shift,
	}
}

// Web-only view wiring for App: forwards root data into child components.
// Child data keeps the session cells (as `in:` slots do in the TUI), so the
// child instances subscribe and update granularly; behaviors read cells with
// `unwrap` at the point of use.

// The classes one pane column carries: focus (`is-active`) and, in explorer
// mode, the extra width of the middle (`is-major`) column.
function paneClass(data, paneId) {
	const active = unwrap(data.active) === paneId
	const major = unwrap(data.viewMode) === "explorer" && `${unwrap(data.currentId)}` === paneId
	return [active && webTheme.activeClass, major && "is-major"].filter(Boolean).join(" ") || null
}

function webViewBehaviors() {
	return {
		headerView: (_self, data) => ({ host: data.appHost, path: data.appPath, mode: data.viewMode }),
		bookmarkView: (_self, data) => ({
			items: data.bookmarkItems,
			mode: data.bookmarkMode,
			open: data.bookmarkOpen,
			query: data.bookmarkQuery,
			selected: data.bookmarkIndex,
			target: data.bookmarkTarget,
		}),
		commandBarView: (_self, data) => ({
			items: data.commandBarItems,
			leftError: data.leftError,
			notice: data.notice,
			rightError: data.rightError,
			active: data.active,
			leftMarked: data.leftMarked,
			rightMarked: data.rightMarked,
		}),
		confirmView: (_self, data) => ({ confirm: data.confirm }),
		leftCrumbsView: (_self, data) => ({
			segments: data.leftSegments,
			paneId: data.leftId,
		}),
		leftDetailView: (_self, data) => ({ entry: data.leftEntry, marked: data.leftMarked, width: data.paneWidth }),
		leftFilterView: (_self, data) => ({
			query: data.leftFilter,
			paneId: data.leftId,
			filtering: data.filtering,
			entries: data.leftEntries,
		}),
		leftListView: (_self, data) => ({
			entries: data.leftEntries,
			cursor: data.leftCursor,
			marked: data.leftMarked,
			paneId: data.leftId,
			active: data.leftActive,
			loading: data.leftLoading,
		}),
		leftPaneClass: (_self, data) => paneClass(data, "left"),
		leftSummaryView: (_self, data) => ({
			entries: data.leftEntries,
			disk: data.leftDisk,
			width: data.paneWidth,
		}),
		// The explorer's first column: the parent of the current directory,
		// a full pane of its own (header, filter, listing, detail, summary).
		parentCrumbsView: (_self, data) => ({
			segments: data.parentSegments,
			paneId: data.parentId,
		}),
		parentDetailView: (_self, data) => ({
			entry: data.parentEntry,
			marked: data.parentMarked,
			width: data.paneWidth,
		}),
		parentFilterView: (_self, data) => ({
			query: data.parentFilter,
			paneId: data.parentId,
			filtering: data.filtering,
			entries: data.parentEntries,
		}),
		parentListView: (_self, data) => ({
			entries: data.parentEntries,
			cursor: data.parentCursor,
			marked: data.parentMarked,
			paneId: data.parentId,
			active: data.parentActive,
			loading: data.parentLoading,
		}),
		parentPaneClass: (_self, data) => paneClass(data, "parent"),
		parentSummaryView: (_self, data) => ({
			entries: data.parentEntries,
			disk: data.parentDisk,
			width: data.paneWidth,
		}),
		panelView: (_self, data) => ({
			// Cells pass through (as `in:` slots do in the TUI); `query`/`value`
			// are written back by the inputs' `inout` two-way bindings.
			open: data.panelOpen,
			entry: data.panelEntry,
			items: data.panelItems,
			opCursor: data.panelOpIndex,
			rows: data.panelRows,
			argCursor: data.panelRowIndex,
			focus: data.panelFocus,
			textual: data.panelTextual,
			argRow: data.panelCursorRow,
			command: data.panelCommand,
			runnable: data.panelRunnable,
			query: data.panelQuery,
			value: data.panelValue,
		}),
		helpView: (_self, data) => ({ open: data.helpOpen }),
		previewView: (_self, data) => ({
			preview: data.preview,
			show: true,
			entry: data.appEntry,
			paneId: data.previewId,
			// The directory column: the inspector pane's own listing, so a
			// previewed directory reads and behaves like a pane.
			dirSegments: data.previewSegments,
			dirEntries: data.previewEntries,
			dirCursor: data.previewCursor,
			dirMarked: data.previewMarked,
			dirActive: data.previewActive,
			dirLoading: data.previewLoading,
		}),
		rightCrumbsView: (_self, data) => ({
			segments: data.rightSegments,
			paneId: data.rightId,
		}),
		rightDetailView: (_self, data) => ({ entry: data.rightEntry, marked: data.rightMarked, width: data.paneWidth }),
		rightFilterView: (_self, data) => ({
			query: data.rightFilter,
			paneId: data.rightId,
			filtering: data.filtering,
			entries: data.rightEntries,
		}),
		rightListView: (_self, data) => ({
			entries: data.rightEntries,
			cursor: data.rightCursor,
			marked: data.rightMarked,
			paneId: data.rightId,
			active: data.rightActive,
			loading: data.rightLoading,
		}),
		rightPaneClass: (_self, data) => paneClass(data, "right"),
		rightSummaryView: (_self, data) => ({
			entries: data.rightEntries,
			disk: data.rightDisk,
			width: data.paneWidth,
		}),
	}
}

// Function: createWebApp
// Builds the root App component for `session` on the web presentation.
function createWebApp(session, options = {}) {
	registerWebComponents()
	const size = options.size ?? cell({ width: 0, height: 0 })
	const help = cell(false)
	const viewer = cell(false)
	const paneWidth = derived([size, session.showPreview], ([value, show]) => {
		if (!value.width) return 0
		const columns = show && value.width >= INSPECTOR_INLINE_WIDTH ? 3 : 2
		return Math.max(1, Math.floor(value.width / columns) - 4)
	})
	const crumbs = (pane) => derived([pane.segments, paneWidth], ([segments, width]) => elideCrumbs(segments, width))
	const quit = (self) => self.unmount?.()
	// DOM inputs have no native `enter` event; the root routes Enter for them.
	const baseKeys = appBehaviors({ normalizeKey, inputOwnsEnter: false, quit }).keys
	const events = appEvents({ quit })
	return ui(appHtml)
		.init(() => ({
			...appInit(session)(),
			uiSize: size,
			helpOpen: help,
			viewerOpen: viewer,
			paneWidth,
			leftSegments: crumbs(session.panes.left),
			parentSegments: crumbs(session.panes.parent),
			rightSegments: crumbs(session.panes.right),
		}))
		.does({
			...createFrameBehaviors({ theme: webTheme }),
			...webViewBehaviors(),
			minSizeTitle: () => "Window too small",
			"effects!": (self) => {
				if (!self._effects) self.effect(() => {
					self._effects = connectEffects(session, self.ref.root, { size, help, viewer })
					return () => self._effects.dispose()
				})
				self._effects.schedule()
			},
			keys: (self, data, event) => {
				if (event.isComposing) return
				const key = normalizeKey(event)
				const busy = unwrap(data.confirm) || unwrap(data.bookmarkOpen) || unwrap(data.panelOpen) || unwrap(data.filtering)
				if (help.value) {
					if (["escape", "q", "?"].includes(key.name)) help.set(false)
					return
				}
				if (!busy && key.name === "?") {
					help.set(true)
					return
				}
				// The viewer only exists while narrow: if the viewport widened
				// underneath it, drop the stale state and keep handling the key.
				if (viewer.value && !isNarrow(data, self)) viewer.set(false)
				if (viewer.value) {
					if (key.name === "escape" || key.name === "v") viewer.set(false)
					else if (key.shift && key.name === "o") session.dispatch("file.open")
					else if (key.shift && key.name === "e") session.dispatch("file.edit")
					return
				}
				if (!busy && key.name === "v" && isNarrow(data, self)) {
					viewer.set(!viewer.value)
					return
				}
				return baseKeys(self, data, event)
			},
		})
		.sub({
			...events,
			"commandbar:run": (self, data, event) => {
				if (event.data === "view.togglePreview" && isNarrow(data, self)) viewer.set(!viewer.value)
				else events["commandbar:run"](self, data, event)
			},
		})
}

export { createWebApp, normalizeKey }

// EOF
