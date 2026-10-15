// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-02

// Module: tcmd/components/Frame
// Shared presentation helpers for the workspace chrome: the responsive
// breakpoints driven by the `uiSize` cell, the pane borders, header rules, the
// command-bar geometry and the overlay visibility gates. Everything here is
// injected into each renderer's App binding. Viewport dimensions are in
// monospace columns/rows; the browser measures them from its own font. The key
// reference's text lives with its overlay in `Help.js`.

import { unwrap } from "select/state/cells"
import { commandBarMarksItem, commandBarRowCount, commandBarStatus } from "./CommandBar.js"
import pkg from "../../../../package.json" with { type: "json" }

// Constant: VERSION
// The published version, read from package.json so the identity bar can never
// drift from what ships.
const VERSION = `${pkg?.version ?? ""}`

// Constant: MODE_SLOTS
// Per-letter slots the identity bar draws the view-mode word through, one
// `<text>` each so every letter can carry its own gradient colour (the same
// trick the `TinyCmd` brand uses). Sized for the longest mode name; a shorter
// one leaves the trailing slots empty, and an empty text node takes no column.
const MODE_SLOTS = "commander".length

// Function: modeWord
// The view-mode name as it reads in the identity bar.
function modeWord(viewMode) {
	return viewMode === "explorer" ? "explorer" : "commander"
}

// Function: modeGradient
// The `[from, to]` brand pair a mode word shimmers along: explorer takes the
// Tiny blues, commander the Cmd oranges, so the mode reads as part of the
// logo rather than as trailing status text.
function modeGradient(env, viewMode) {
	return viewMode === "explorer"
		? [env.theme.brandTinyFrom, env.theme.brandTinyTo]
		: [env.theme.brandCmdFrom, env.theme.brandCmdTo]
}

// Function: versionTrail
// The identity bar's version tail, ` · 0.1.3`. It carries its leading space
// so it follows the mode word's slots directly in both renderers.
function versionTrail() {
	return VERSION ? ` · ${VERSION}` : ""
}

// Below this the two-pane workspace is replaced by a resize hint.
const MIN_WIDTH = 64
const MIN_HEIGHT = 16
// At or above this the inspector can sit beside the panes; below it becomes a
// fullscreen overlay.
const INSPECTOR_INLINE_WIDTH = 100

// Function: sizeOf
// Reads the viewport size from the App data, falling back to the renderer's
// own dimensions so the gates work even when no `uiSize` cell is injected
// (tests, web). Returns `null` when neither is known.
function sizeOf(data, self) {
	const size = unwrap(data?.uiSize)
	if (size && (size.width || size.height)) return size
	const width = Math.floor(self?.ctx?.width ?? 0)
	const height = Math.floor(self?.ctx?.height ?? 0)
	if (!width && !height) return null
	return { width, height }
}

// Function: isNarrow
// True when the viewport is known and too narrow for the inline inspector.
function isNarrow(data, self) {
	const size = sizeOf(data, self)
	return Boolean(size && (size.width ?? 0) > 0 && size.width < INSPECTOR_INLINE_WIDTH)
}

// Function: isExplorer
// True when the workspace is the three-column explorer view. Absent
// `viewMode` data (tests, host-less bindings) means the two-pane commander.
function isExplorer(data) {
	return unwrap(data?.viewMode) === "explorer"
}

// Function: currentColumnId
// The id of the column holding the current directory: the focused pane when
// focus is on source/destination, the anchor pane otherwise. (`core/pane` has
// the same question over a session; this one reads the view's data bag.)
function currentColumnId(data) {
	return `${unwrap(data?.currentId) ?? unwrap(data?.active) ?? "left"}`
}

// Constant: PANE_GROW
// The explorer's current column is this much wider than the parent/preview
// mirrors — enough to read as the working pane, not enough to starve its
// neighbours. Both renderers apply the same ratio (the TUI's pane row growers
// and the web CSS `.pane.is-major`), so the geometry has one source of truth
// here.
const PANE_GROW = 1.35

// Function: paneColumnWidth
// The columns a pane's column occupies at viewport `width` for the current
// view. Explorer leads with the parent mirror and grows the current column by
// PANE_GROW, so its mirrors are narrower than an even split; commander tiles
// its two panes evenly. The inline inspector adds an equal column to either.
// Panes hidden in the view, and an unknown viewport (`width <= 0`), are 0.
//
// The caller subtracts its own chrome (border, inset, safety) to get a content
// budget: feeding every pane an even `width / columns` makes the narrower
// mirror columns overflow, and the renderer then mangles their breadcrumbs.
function paneColumnWidth(width, paneId, { viewMode, currentId, showPreview } = {}) {
	const total = Math.floor(width ?? 0)
	if (total <= 0) return 0
	const weights = {}
	if (viewMode === "explorer") {
		weights.parent = 1
		weights[`${currentId}` === "right" ? "right" : "left"] = PANE_GROW
	} else {
		weights.left = 1
		weights.right = 1
	}
	if (Boolean(showPreview) && total >= INSPECTOR_INLINE_WIDTH) weights.preview = 1
	const weight = weights[paneId] ?? 0
	if (weight <= 0) return 0
	const sum = Object.values(weights).reduce((acc, value) => acc + value, 0)
	return Math.floor((total * weight) / sum)
}

// Function: commandBarRowsFor
// The entries the bar currently shows: the context hints or the `bar`
// commands, plus the active pane's marked count as a trailing entry.
function commandBarRowsFor(data) {
	const items = unwrap(data?.commandBarItems) ?? []
	const marks = commandBarMarksItem(data)
	return marks ? [...items, marks] : items
}

// Function: commandBarLines
// Rows the wrapped command bar occupies at the current viewport (the bar
// is inset one column from the viewport edge).
function commandBarLines(data, self) {
	const width = Math.floor(sizeOf(data, self)?.width ?? 0)
	if (width <= 0) return 1
	return commandBarRowCount(commandBarRowsFor(data), width - 1)
}

// Function: paneListHeight
// Rows available to a pane's listing: the viewport height minus the identity
// bar (1), the pane's own border (2), the pane header + rule (2), the entry
// detail (2) and the wrapped command bar — seven chrome rows plus the bar.
// Fed to the windowed `filelist` so a large directory mounts only the visible
// slice. `0` means "unknown — render everything to measure".
function paneListHeight(data, self) {
	const height = Math.floor(sizeOf(data, self)?.height ?? 0)
	if (height <= 0) return 0
	// A notice or error swaps the keys for a one-line status.
	const bar = commandBarStatus(data) ? 1 : commandBarLines(data, self)
	return Math.max(1, height - 7 - bar)
}

// Function: mixHex
// Linear interpolation between two `#rrggbb` colours at `t` in [0, 1]. A
// missing colour (the mono theme) yields `undefined` so the whole run falls
// back to the terminal default.
function mixHex(from, to, t) {
	if (!from || !to) return undefined
	const channel = (index) => {
		const a = Number.parseInt(from.slice(index, index + 2), 16)
		const b = Number.parseInt(to.slice(index, index + 2), 16)
		return Math.round(a + (b - a) * t)
			.toString(16)
			.padStart(2, "0")
	}
	return `#${channel(1)}${channel(3)}${channel(5)}`
}

// Function: shineOf
// One `{ letter, fg }` per letter of a brand word, interpolating `from` → `to`
// across it so the word reads as a gradient; a missing colour (mono theme)
// leaves every `fg` undefined and the run falls back to the terminal default.
function shineOf(letters, from, to) {
	return `${letters}`.split("").map((letter, index, all) => ({
		letter,
		fg: mixHex(from, to, index / (all.length - 1)),
	}))
}

// Function: createFrameBehaviors
// Behaviors for the App root and its chrome.
function createFrameBehaviors(env) {
	const tiny = shineOf("Tiny", env.theme.brandTinyFrom, env.theme.brandTinyTo)
	const cmd = shineOf("Cmd", env.theme.brandCmdFrom, env.theme.brandCmdTo)
	// The mode word, letter by letter: `modeL<i>` is the letter, `modeFg<i>`
	// its gradient colour — the same per-letter trick the `TinyCmd` brand
	// uses, since a terminal has no gradient to draw. The run is cached per
	// word (there are only two), and both behaviors read the live `viewMode`,
	// so flipping `t` redraws it in the other brand's colours.
	const modeRuns = new Map()
	const modeRun = (data) => {
		const viewMode = unwrap(data?.viewMode)
		const word = modeWord(viewMode)
		let run = modeRuns.get(word)
		if (!run) {
			run = shineOf(word, ...modeGradient(env, viewMode))
			modeRuns.set(word, run)
		}
		return run
	}
	const modeSlots = {}
	for (let i = 0; i < MODE_SLOTS; i++) {
		// The `when` gate matters: an empty text node still claims a column in
		// the row, so the slots past the end of a shorter word are dropped
		// from the layout instead of padding it.
		modeSlots[`modeHas${i}`] = (_self, data) => modeRun(data)[i] !== undefined
		modeSlots[`modeL${i}`] = (_self, data) => modeRun(data)[i]?.letter ?? ""
		modeSlots[`modeFg${i}`] = (_self, data) => modeRun(data)[i]?.fg
	}
	return {
		// Identity bar: "Tiny" shimmers along the brand blues, "Cmd" along a
		// brighter orange than the mark accent, and the host trail follows in
		// the heading colour. Everything else on screen belongs to the user's
		// files; this one row is the app's own.
		brandT: () => tiny[0].letter,
		brandTFg: () => tiny[0].fg,
		brandI: () => tiny[1].letter,
		brandIFg: () => tiny[1].fg,
		brandN: () => tiny[2].letter,
		brandNFg: () => tiny[2].fg,
		brandY: () => tiny[3].letter,
		brandYFg: () => tiny[3].fg,
		brandC: () => cmd[0].letter,
		brandCFg: () => cmd[0].fg,
		brandM: () => cmd[1].letter,
		brandMFg: () => cmd[1].fg,
		brandD: () => cmd[2].letter,
		brandDFg: () => cmd[2].fg,
		topBar: (_self, data) => {
			const host = `${unwrap(data.appHost) ?? ""}`.trim()
			return host ? ` - ${host} ` : " "
		},
		topBarFg: () => env.theme.textHeadingFg,
		// Right-aligned trail: the version, following the gradiented mode word
		// (`modeL*`) slot by slot. Dimmer than the brand, so the row still
		// reads left to right.
		topBarStatus: () => versionTrail(),
		topBarStatusFg: () => env.theme.textSecondaryFg,
		...modeSlots,

		// Responsive gates. `uiSize` is absent in tests and the web, so the
		// workspace renders normally there.
		tooSmall: (self, data) => {
			const size = sizeOf(data, self)
			if (!size) return false
			return (size.width ?? MIN_WIDTH) < MIN_WIDTH || (size.height ?? MIN_HEIGHT) < MIN_HEIGHT
		},
		minSizeTitle: () => "Terminal too small",
		minSizeHint: (self, data) => {
			const size = sizeOf(data, self) ?? { width: 0, height: 0 }
			return `need ${MIN_WIDTH}x${MIN_HEIGHT}, have ${size.width ?? 0}x${size.height ?? 0}`
		},
		// The min-size gate text uses the heading/secondary text tokens.
		titleFg: () => env.theme.textHeadingFg,
		dimFg: () => env.theme.textSecondaryFg,

		// Each pane is a complete box. Both draw all four edges (the middle
		// shows two adjacent rules) so each pane's border colour can track its
		// own focus independently — a shared edge would be owned by one pane
		// and never highlight when the other is active.
		leftBorder: () => ["top", "left", "bottom", "right"],
		rightBorder: () => ["top", "left", "bottom", "right"],
		// The header rule separates the pane header row from the listing body.
		headRule: () => ["top"],

		// The breadcrumb yields the pane header row to the filter while a
		// filter is being edited or applied.
		leftFilterOn: (_self, data) => Boolean(unwrap(data.leftFilter)),
		rightFilterOn: (_self, data) => Boolean(unwrap(data.rightFilter)),
		parentFilterOn: (_self, data) => Boolean(unwrap(data.parentFilter)),

		// Which columns the workspace draws. Commander tiles source and
		// destination; explorer drops destination for the parent of the
		// current directory, which leads the row so the current pane stays in
		// the middle. The inspector column follows `showInspectorInline` and
		// completes the three columns in either mode. Maximizing the inspector
		// (`⇧V`) hides every column so the preview can take the row.
		showParentPane: (_self, data) => isExplorer(data) && !unwrap(data?.previewFull),
		showLeftPane: (_self, data) =>
			(!isExplorer(data) || currentColumnId(data) === "left") && !unwrap(data?.previewFull),
		showRightPane: (_self, data) =>
			(!isExplorer(data) || currentColumnId(data) === "right") && !unwrap(data?.previewFull),

		// The inline inspector shows when the preview is on and the viewport is
		// wide enough; the viewer overlay shows whenever it is open, at any
		// width (`v` on a narrow terminal, or Enter on a file that cannot be
		// edited). Maximizing (`⇧V`) replaces the column with
		// `showPreviewFull` below.
		inspectorNarrow: (self, data) => isNarrow(data, self),
		showInspectorInline: (self, data) =>
			Boolean(unwrap(data.showPreview)) && !isNarrow(data, self) && !unwrap(data?.previewFull),
		showViewer: (_self, data) => Boolean(unwrap(data.viewerOpen)),
		// The maximized inspector: the preview fills the pane row in either
		// view mode, pushed by `view.maximize` (`⇧V`).
		showPreviewFull: (_self, data) => Boolean(unwrap(data?.previewFull)),

		// Help overlay visibility; the content lives in `Help.js` so the
		// overlay has a single source of truth.
		helpOpen: (_self, data) => Boolean(unwrap(data.helpOpen)),

		// The windowed listing height for both panes (they share the row).
		listViewport: (self, data) => paneListHeight(data, self),

		// The command bar's height: one line for a status, otherwise as many
		// rows as the wrapped bracket shorthands need.
		barHeight: (self, data) => (commandBarStatus(data) ? 1 : commandBarLines(data, self)),
	}
}

export {
	commandBarLines,
	createFrameBehaviors,
	currentColumnId,
	INSPECTOR_INLINE_WIDTH,
	isExplorer,
	isNarrow,
	MIN_HEIGHT,
	MIN_WIDTH,
	MODE_SLOTS,
	modeGradient,
	modeWord,
	PANE_GROW,
	paneColumnWidth,
	sizeOf,
	versionTrail,
	VERSION,
}
// EOF
