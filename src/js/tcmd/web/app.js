// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/app
// Binds the shared App controller (`components/App.js`) to the web layout
// (`components/App.html`) and to the select.js `ui` runtime. Mirrors
// `tcmd/tui/app.js` for the DOM backend.

import { ui } from "select/ui"
import appHtml from "../components/App.html" with { type: "text" }
import { appBehaviors, appEvents, appInit, read } from "../components/index.js"
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
function webViewBehaviors() {
	return {
		leftCrumbsView: (_self, data) => ({
			segments: read(data.leftSegments),
			paneId: data.leftId,
		}),
		leftListView: (_self, data) => ({
			entries: read(data.leftEntries),
			cursor: read(data.leftCursor),
			marked: read(data.leftMarked),
			paneId: data.leftId,
		}),
		leftPaneClass: (_self, data) => (read(data.active) === "left" ? "is-active" : null),
		leftSummaryView: (_self, data) => ({
			entries: read(data.leftEntries),
			disk: read(data.leftDisk),
		}),
		paletteView: (_self, data) => ({
			// `query` stays a cell: the input's `inout` two-way binding writes it.
			items: read(data.paletteItems),
			open: read(data.paletteOpen),
			query: data.paletteQuery,
			selected: read(data.paletteIndex),
		}),
		previewView: (_self, data) => ({
			preview: read(data.preview),
			show: read(data.showPreview),
		}),
		rightCrumbsView: (_self, data) => ({
			segments: read(data.rightSegments),
			paneId: data.rightId,
		}),
		rightListView: (_self, data) => ({
			entries: read(data.rightEntries),
			cursor: read(data.rightCursor),
			marked: read(data.rightMarked),
			paneId: data.rightId,
		}),
		rightPaneClass: (_self, data) => (read(data.active) === "right" ? "is-active" : null),
		rightSummaryView: (_self, data) => ({
			entries: read(data.rightEntries),
			disk: read(data.rightDisk),
		}),
		toolbarView: (_self, data) => ({ commands: read(data.commandRows) }),
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
				...webTheme,
				normalizeKey,
				quit: (self) => self.unmount?.(),
			}),
			...webViewBehaviors(),
		})
		.sub(appEvents())
}

export { createWebApp }
