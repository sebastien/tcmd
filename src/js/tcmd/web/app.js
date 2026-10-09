// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/app
// Binds the shared App controller (`components/App.js`) to the web layout
// (`components/App.html`) and to the select.js `ui` runtime. Mirrors
// `tcmd/tui/app.js` for the DOM backend.

import { ui } from "select/ui"
import { unwrap } from "select/state/cells"
import appHtml from "../components/App.html" with { type: "text" }
import { appBehaviors, appEvents, appInit } from "../components/index.js"
import { registerWebComponents } from "./catalogue.js"
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
function webViewBehaviors() {
	return {
		headerView: (_self, data) => ({ host: data.appHost, path: data.appPath }),
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
		}),
		confirmView: (_self, data) => ({ confirm: data.confirm }),
		leftCrumbsView: (_self, data) => ({
			segments: data.leftSegments,
			paneId: data.leftId,
		}),
		leftDetailView: (_self, data) => ({ entry: data.leftEntry }),
		leftFilterView: (_self, data) => ({
			query: data.leftFilter,
			paneId: data.leftId,
			filtering: data.filtering,
			entries: data.leftEntries,
		}),
		leftLabelView: (_self, data) => ({ paneId: data.leftId, active: data.active }),
		leftListView: (_self, data) => ({
			entries: data.leftEntries,
			cursor: data.leftCursor,
			marked: data.leftMarked,
			paneId: data.leftId,
		}),
		leftPaneClass: (_self, data) => (unwrap(data.active) === "left" ? webTheme.activeClass : null),
		leftSummaryView: (_self, data) => ({
			entries: data.leftEntries,
			disk: data.leftDisk,
		}),
		paletteView: (_self, data) => ({
			// Cells pass through (as `in:` slots do in the TUI); `query` is written
			// back by the input's `inout` two-way binding.
			items: data.paletteItems,
			mode: data.paletteMode,
			open: data.paletteOpen,
			query: data.paletteQuery,
			selected: data.paletteIndex,
		}),
		previewView: (_self, data) => ({
			preview: data.preview,
			show: data.showPreview,
		}),
		rightCrumbsView: (_self, data) => ({
			segments: data.rightSegments,
			paneId: data.rightId,
		}),
		rightDetailView: (_self, data) => ({ entry: data.rightEntry }),
		rightFilterView: (_self, data) => ({
			query: data.rightFilter,
			paneId: data.rightId,
			filtering: data.filtering,
			entries: data.rightEntries,
		}),
		rightLabelView: (_self, data) => ({ paneId: data.rightId, active: data.active }),
		rightListView: (_self, data) => ({
			entries: data.rightEntries,
			cursor: data.rightCursor,
			marked: data.rightMarked,
			paneId: data.rightId,
		}),
		rightPaneClass: (_self, data) => (unwrap(data.active) === "right" ? webTheme.activeClass : null),
		rightSummaryView: (_self, data) => ({
			entries: data.rightEntries,
			disk: data.rightDisk,
		}),
	}
}

// Function: createWebApp
// Builds the root App component for `session` on the web presentation.
function createWebApp(session) {
	registerWebComponents()
	// The command panel is a TUI-only view; disable it so no web dispatch path
	// (key, palette, command bar) opens an invisible modal, and drop its
	// palette entries (`:` and `m` both fall back to the script palette).
	session.panelEnabled?.set(false)
	const palette = session.paletteCommands?.value
	if (palette) {
		session.paletteCommands.set(palette.filter((row) => row.id !== "panel.toggle" && row.id !== "panel.open"))
	}
	return ui(appHtml)
		.init(appInit(session))
		.does({
			...appBehaviors({
				normalizeKey,
				quit: (self) => self.unmount?.(),
			}),
			...webViewBehaviors(),
		})
		.sub(appEvents())
}

export { createWebApp, normalizeKey }

// EOF
