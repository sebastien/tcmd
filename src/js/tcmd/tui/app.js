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
// (the `?` overlay). A third, `viewer`, tracks the fullscreen inspector used
// below the inline-inspector breakpoint. None of them exist in the web view.

import { cell, derived, unwrap } from "select/state/cells"
import { ui } from "select.tui"
import appXml from "../components/App.xml" with { type: "text" }
import { elideCrumbs } from "../components/format.js"
import { appBehaviors, appEvents, appInit } from "../components/index.js"
import { registerComponents } from "./catalogue.js"
import { createFrameBehaviors, currentColumnId, INSPECTOR_INLINE_WIDTH, isExplorer, isNarrow } from "../components/Frame.js"
import { tuiTheme } from "./theme.js"

// Constant: CURRENT_GROW
// How much wider the explorer's middle (current) column is than its
// neighbours — enough to read as the working pane, not enough to starve the
// parent and preview columns.
const CURRENT_GROW = 1.35

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
	const viewer = options.viewer ?? cell(false)

	// Columns available to a pane's breadcrumb strip: the viewport shared by
	// the panes (plus the inline inspector), minus the pane border, the
	// header inset, the SRC/DST slot and a safety column. `0` (unknown, web)
	// disables the collapse.
	const crumbWidth = derived([size, session.showPreview], ([value, showPreview]) => {
		const width = Math.floor(value?.width ?? 0)
		if (width <= 0) return 0
		const columns = showPreview && width >= INSPECTOR_INLINE_WIDTH ? 3 : 2
		return Math.max(8, Math.floor(width / columns) - 8)
	})
	// The elided breadcrumb segments for each pane (presentation-only view of
	// the pane's own segment list; paths stay intact for clicks).
	const leftCrumbs = derived([session.panes.left.segments, crumbWidth], ([segments, width]) =>
		elideCrumbs(segments, width),
	)
	const rightCrumbs = derived([session.panes.right.segments, crumbWidth], ([segments, width]) =>
		elideCrumbs(segments, width),
	)
	const parentCrumbs = derived([session.panes.parent.segments, crumbWidth], ([segments, width]) =>
		elideCrumbs(segments, width),
	)

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
				// The fullscreen viewer: Esc closes, O/E act on the file.
				if (viewer.value && isNarrow(data, self)) {
					if (name === "escape") {
						viewer.set(false)
						return
					}
					if (name === "o" && key.shift) return data.dispatch("file.open", { paneId: unwrap(data.active) })
					if (name === "e" && key.shift) return data.dispatch("file.edit", { paneId: unwrap(data.active) })
					return
				}
				// Below the inline breakpoint `v` toggles the viewer overlay
				// instead of the side panel (`⇧V` still maximizes).
				if (!busy && name === "v" && !key.shift && isNarrow(data, self)) {
					viewer.set(!viewer.value)
					return
				}
				return baseKeys(self, data, event)
			},
			// TUI-only presentation of the shared App state.
			leftBorderFg: (_self, data) =>
				unwrap(data.active) === "left" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
			rightBorderFg: (_self, data) =>
				unwrap(data.active) === "right" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
			parentBorderFg: (_self, data) =>
				unwrap(data.active) === "parent" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
			// The header rule carries the same focus tint as the pane border.
			leftHeadRuleFg: (_self, data) =>
				unwrap(data.active) === "left" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
			rightHeadRuleFg: (_self, data) =>
				unwrap(data.active) === "right" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
			parentHeadRuleFg: (_self, data) =>
				unwrap(data.active) === "parent" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
			// In explorer the current column takes the extra width; in
			// commander both panes share the row evenly. The columns carry
			// `flexBasis="0"` so the whole row is distributed by these
			// growers instead of by the content each column would claim.
			leftGrow: (_self, data) =>
				isExplorer(data) && currentColumnId(data) === "left" ? CURRENT_GROW : 1,
			rightGrow: (_self, data) =>
				isExplorer(data) && currentColumnId(data) === "right" ? CURRENT_GROW : 1,
		})
		.sub(appEvents({ quit }))
		.using(appXml)
}

export { createAppComponent }

// EOF
