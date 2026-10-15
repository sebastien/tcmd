// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/app
// Binds the shared App controller (`components/App.js`) to the TUI layout
// (`components/App.xml`) and to the select.tui `ui` runtime.
//
// The TUI layers two presentation-only cells on top of the shared controller:
// `size` (viewport dimensions from the renderer's resize events) and `help`
// (the `?` overlay). The fullscreen inspector is not one of them: it lives in
// the session (`viewerOpen`), so a command can open it and both renderers show
// it (`components/Frame#showViewer`).

import { cell, derived, unwrap } from "select/state/cells"
import { ui } from "select.tui"
import appXml from "../components/App.xml" with { type: "text" }
import { elideCrumbs } from "../components/format.js"
import { appBehaviors, appEvents, appInit } from "../components/index.js"
import { registerComponents } from "./catalogue.js"
import { createFrameBehaviors, currentColumnId, isExplorer, paneColumnWidth, PANE_GROW } from "../components/Frame.js"
import { tuiTheme } from "./theme.js"

// Columns available to a pane's breadcrumb strip: the viewport split by the
// panes' own grow ratios (explorer grows the current column, so its mirrors
// are narrower than an even split), minus the pane chrome. `0` (unknown, web)
// disables the collapse.
function crumbWidthFor(size, session, paneId) {
	return derived([size, session.showPreview, session.viewMode, session.currentId], ([value, showPreview, viewMode, currentId]) => {
		const columns = paneColumnWidth(value?.width, paneId, { viewMode, currentId, showPreview })
		return columns > 0 ? Math.max(8, columns - 8) : 0
	})
}

// The elided breadcrumb segments for one pane (a presentation-only view of the
// pane's own segment list; paths stay intact for clicks).
function paneCrumbs(size, session, paneId, pane) {
	return derived([pane.segments, crumbWidthFor(size, session, paneId)], ([segments, width]) => elideCrumbs(segments, width))
}

// Function: attachModifierHint
// TUI-only: while Shift or Ctrl is held, point the command bar at that
// modifier's own bindings; releasing it restores the default hints. Requires
// the kitty keyboard protocol (see `tui/index.js`), which reports modifier key
// presses and releases; on a terminal that does not, the bar simply never
// changes. Any ordinary chord also re-sets the state from its own modifiers, so
// a missed release can never leave the bar stuck. Returns a teardown.
function attachModifierHint(session, keyInput) {
	if (!keyInput?.on) return () => {}
	const modifierOf = (name) => {
		if (name === "leftshift" || name === "rightshift" || name === "shift") return "shift"
		if (name === "leftctrl" || name === "rightctrl" || name === "control") return "ctrl"
		return null
	}
	const set = (value) => {
		if (session.barModifier.value !== value) session.barModifier.set(value)
	}
	const onPress = (key) => {
		set(modifierOf(key?.name) ?? (key?.ctrl ? "ctrl" : key?.shift ? "shift" : null))
	}
	const onRelease = (key) => {
		if (modifierOf(key?.name)) set(null)
	}
	keyInput.on("keypress", onPress)
	keyInput.on("keyrelease", onRelease)
	return () => {
		keyInput.off("keypress", onPress)
		keyInput.off("keyrelease", onRelease)
	}
}

// Function: createAppComponent
// Builds the root component bound to a `session`.
//
// Options:
// - `size`: a `{ width, height }` cell fed by renderer resize events.
// - `help`: the `?` overlay visibility cell.
//
// Example:
// ```javascript
// const App = createAppComponent(session, { size })
// await render(App, { useMouse: true })
// ```
function createAppComponent(session, options = {}) {
	registerComponents()
	const size = options.size ?? cell({ width: 0, height: 0 })
	const help = options.help ?? cell(false)
	// The fullscreen inspector overlay lives in the session (core), so a
	// command — Enter on a file that cannot be edited — can open it; the
	// renderer only shows it (`components/Frame#showViewer`).
	const viewer = session.viewerOpen

	// Columns available to each pane's breadcrumb strip: the pane's own share
	// of the viewport (explorer's current column is wider, so its mirrors are
	// narrower), minus the pane chrome. `0` (unknown, web) disables the
	// collapse. An even `width / columns` split used to overflow the narrower
	// mirror columns, which the renderer then mangled.
	const leftCrumbs = paneCrumbs(size, session, "left", session.panes.left)
	const rightCrumbs = paneCrumbs(size, session, "right", session.panes.right)
	const parentCrumbs = paneCrumbs(size, session, "parent", session.panes.parent)
	const previewCrumbs = paneCrumbs(size, session, "preview", session.panes.preview)

	const quit = options.quit ?? ((self) => {
		// Destroying the renderer from within a keypress deadlocks the native
		// render loop; defer past the current frame.
		setTimeout(() => {
			self.quit()
			process.exit(0)
		}, 100)
	})

	const baseKeys = appBehaviors({ quit }).keys
	const frame = createFrameBehaviors({ theme: tuiTheme })
	const appSubs = appEvents({ quit })

	// The active pane's border and head rule take the view mode's own accent:
	// the Tiny blue in explorer, the gold accent in commander. An inactive
	// pane keeps the muted border. `isExplorer` defaults an absent mode to
	// commander, matching the rest of the workspace.
	const paneActiveFg = (data) =>
		isExplorer(data) ? tuiTheme.borderActiveExplorerFg : tuiTheme.borderSecondaryActiveFg
	const paneBorderFg = (paneId) => (_self, data) =>
		unwrap(data.active) === paneId ? paneActiveFg(data) : tuiTheme.borderSecondaryFg

	return ui
		.component("App")
		.init(() => ({
			...appInit(session)(),
			uiSize: size,
			helpOpen: help,
			viewerOpen: viewer,
			leftSegments: leftCrumbs,
			parentSegments: parentCrumbs,
			rightSegments: rightCrumbs,
			previewSegments: previewCrumbs,
		}))
		.does({
			...frame,
			keys: (self, data, event) => {
				const key = event
				const name = key?.name
				const isQuestion = name === "?" || (name === "/" && key?.shift)
				const busy =
					unwrap(data.confirm) ||
					unwrap(data.filtering) ||
					unwrap(data.bookmarkOpen) ||
					unwrap(data.panelOpen)

				// Help overlay owns the keyboard while open.
				if (unwrap(data.helpOpen)) {
					if (name === "escape" || name === "q" || isQuestion) help.set(false)
					return
				}
				if (!busy && isQuestion) {
					help.set(true)
					return
				}
				// The viewer overlay and the narrow-`v` shortcut are shared
				// modal routing, handled by `components/App#createBehaviors`.
				return baseKeys(self, data, event)
			},
			// TUI-only presentation of the shared App state: each pane's
			// border and header rule track its own focus, tinted by the view
			// mode (explorer blue, commander gold).
			leftBorderFg: paneBorderFg("left"),
			rightBorderFg: paneBorderFg("right"),
			parentBorderFg: paneBorderFg("parent"),
			// The header rule carries the same focus tint as the pane border.
			leftHeadRuleFg: paneBorderFg("left"),
			rightHeadRuleFg: paneBorderFg("right"),
			parentHeadRuleFg: paneBorderFg("parent"),
			// In explorer the current column takes the extra width; in
			// commander both panes share the row evenly. The columns carry
			// `flexBasis="0"` so the whole row is distributed by these
			// growers instead of by the content each column would claim.
			leftGrow: (_self, data) =>
				isExplorer(data) && currentColumnId(data) === "left" ? PANE_GROW : 1,
			rightGrow: (_self, data) =>
				isExplorer(data) && currentColumnId(data) === "right" ? PANE_GROW : 1,
		})
		.sub({
			...appSubs,
			// The bar's `[Help ?]` entry opens the overlay, the same path as the
			// `?` key (the renderer owns the help cell).
			"commandbar:run": (self, data, event) => {
				if (event.data === "app.help") {
					help.set(!help.value)
					return
				}
				appSubs["commandbar:run"](self, data, event)
			},
		})
		.using(appXml)
}

export { attachModifierHint, createAppComponent }

// EOF
