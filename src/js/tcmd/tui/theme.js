// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/theme
// Central place for TUI colors so the look can be retuned in one spot. The
// palette is resolved once at load from the environment:
//
// - `TCMD_THEME=dark|light|mono` forces a variant.
// - `NO_COLOR` (any value) or `TERM=dumb` falls back to mono.
// - anything else uses dark.
//
// Every token is an OpenTUI color string, or `undefined` to mean "terminal
// default" (which is what mono uses throughout). Non-color emphasis (markers,
// borders, bold/underline attributes) carries the state in mono.
//
// Token groups (see tui/catalogue.js for the env they feed):
//
// - Surfaces:  panel/overlay backgrounds and the two selection rows.
//              `cursorBg` marks the active pane's cursor row and
//              `cursorInactiveBg` the inactive pane's, so focus is visible
//              from the cursor alone.
// - Text:      primary, secondary (hints) and heading (titles/breadcrumbs).
// - Borders:   secondary (pane box borders, header rules, active/inactive) and
//              primary (the frame and the modal overlays).
// - Accent:    primary (cursor, active pane label) and secondary (marks).
// - Semantic:  error, warning and tip, each with a background + foreground
//              for filled badges (the command bar status, the confirm dialog).
// - Content:   the file-listing colors (file/link/device/directory).

// Constant: DARK
// Tokyo-Night-ish dark palette.
const DARK = {
	// Surfaces
	surfaceBg: "#1f2335",
	overlayBg: "#1f2335",
	mutedBg: "#292e42",
	cursorBg: "#3a5f8a",
	cursorInactiveBg: "#2a3149",
	selectionBg: "#2f3b5c",
	// Text
	textFg: "#c0caf5",
	textSecondaryFg: "#565f89",
	textHeadingFg: "#a9b1d6",
	// Borders
	borderSecondaryFg: "#414868",
	borderSecondaryActiveFg: "#9ece6a",
	borderPrimaryFg: "#565f89",
	borderPrimaryActiveFg: "#7aa2f7",
	// Accent
	accentFg: "#9ece6a",
	accentBg: "#2f3b5c",
	accentSecondaryFg: "#e0af68",
	accentSecondaryBg: "#3a3a30",
	// Semantics
	errorFg: "#f7768e",
	errorBg: "#3a2630",
	warningFg: "#ff9e64",
	warningBg: "#3a2e24",
	tipFg: "#7dcfff",
	tipBg: "#26323a",
	// Content
	fileFg: "#c0caf5",
	linkFg: "#7dcfff",
	devFg: "#bb9af7",
	dirFg: "#7aa2f7",
}

// Constant: LIGHT
// Palette tuned for light terminal backgrounds: darker, lower-chroma hues.
const LIGHT = {
	// Surfaces
	surfaceBg: "#e6e7ea",
	overlayBg: "#e6e7ea",
	mutedBg: "#d0d3dc",
	cursorBg: "#9fb4d6",
	cursorInactiveBg: "#c3cad9",
	selectionBg: "#c4c8d6",
	// Text
	textFg: "#1f2335",
	textSecondaryFg: "#6b7089",
	textHeadingFg: "#343b58",
	// Borders
	borderSecondaryFg: "#b7b9c4",
	borderSecondaryActiveFg: "#33635c",
	borderPrimaryFg: "#8b8fa3",
	borderPrimaryActiveFg: "#3d59a1",
	// Accent
	accentFg: "#33635c",
	accentBg: "#c4c8d6",
	accentSecondaryFg: "#8f5e15",
	accentSecondaryBg: "#d8d2bf",
	// Semantics
	errorFg: "#8c4351",
	errorBg: "#e2c6cc",
	warningFg: "#b45309",
	warningBg: "#ecd6bd",
	tipFg: "#33635c",
	tipBg: "#c8dbe4",
	// Content
	fileFg: "#1f2335",
	linkFg: "#20639b",
	devFg: "#6a3f8c",
	dirFg: "#3d59a1",
}

// Constant: MONO
// No color at all: the terminal's own foreground/background. State is carried
// by markers (`>`, `*`, `[`, `]`, `▸`) and the selected-row background.
const MONO = {
	surfaceBg: undefined,
	overlayBg: undefined,
	mutedBg: undefined,
	cursorBg: undefined,
	cursorInactiveBg: undefined,
	selectionBg: undefined,
	textFg: undefined,
	textSecondaryFg: undefined,
	textHeadingFg: undefined,
	borderSecondaryFg: undefined,
	borderSecondaryActiveFg: undefined,
	borderPrimaryFg: undefined,
	borderPrimaryActiveFg: undefined,
	accentFg: undefined,
	accentBg: undefined,
	accentSecondaryFg: undefined,
	accentSecondaryBg: undefined,
	errorFg: undefined,
	errorBg: undefined,
	warningFg: undefined,
	warningBg: undefined,
	tipFg: undefined,
	tipBg: undefined,
	fileFg: undefined,
	linkFg: undefined,
	devFg: undefined,
	dirFg: undefined,
}

// Function: resolveTheme
// Picks the palette for `environment` (defaults to `process.env`).
function resolveTheme(environment = globalThis.process?.env ?? {}) {
	const name = environment.TCMD_THEME
	if (name === "light") return LIGHT
	if (name === "dark") return DARK
	if (name === "mono") return MONO
	if (environment.NO_COLOR !== undefined && environment.NO_COLOR !== "") return MONO
	if (environment.TERM === "dumb") return MONO
	return DARK
}

const tuiTheme = resolveTheme()

export { DARK, LIGHT, MONO, resolveTheme, tuiTheme }

// EOF
