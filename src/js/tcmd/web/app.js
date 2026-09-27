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
	return {
		name: KEY_NAMES[raw] ?? raw,
		ctrl: Boolean(event?.ctrlKey),
		meta: Boolean(event?.metaKey),
		shift: Boolean(event?.shiftKey),
	}
}

// Web-only view wiring for App: forwards root data into child components.
// Child data keeps the session cells (as `in:` slots do in the TUI), so the
// child instances subscribe and update granularly; behaviors read cells with
// `unwrap` at the point of use.
function webViewBehaviors() {
	return {
		leftCrumbsView: (_self, data) => ({
			segments: data.leftSegments,
			paneId: data.leftId,
		}),
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
		toolbarView: (_self, data) => ({ commands: data.toolbarCommands }),
	}
}

// Function: createWebApp
// Builds the root App component for `session` on the web presentation.
function createWebApp(session) {
	registerWebComponents()
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

export { createWebApp }

// EOF
