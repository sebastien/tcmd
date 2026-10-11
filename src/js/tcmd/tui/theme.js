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
// - Brand:     the identity-bar gradient endpoints — "Tiny" stays blue, "Cmd"
//              runs gold to saturated orange.

// Constant: DARK
// Night-blue palette with gold accents: deep blue surfaces and borders,
// gold for focus and primary accents, saturated orange for marks, purple for
// devices and tips.
const DARK = {
	// Surfaces
	surfaceBg: "#0d1526",
	overlayBg: "#111b31",
	mutedBg: "#1c2a4d",
	cursorBg: "#274a9e",
	cursorInactiveBg: "#1b2a51",
	selectionBg: "#2b3f78",
	// Text
	textFg: "#e6ecff",
	textSecondaryFg: "#8fa3d9",
	textHeadingFg: "#ffffff",
	// Borders
	borderSecondaryFg: "#33508f",
	borderSecondaryActiveFg: "#f0b429",
	borderPrimaryFg: "#3d5590",
	borderPrimaryActiveFg: "#ffc233",
	// Accent
	accentFg: "#ffc233",
	accentBg: "#4a3a14",
	accentSecondaryFg: "#ff7a1a",
	accentSecondaryBg: "#4a2a0c",
	// Semantics
	errorFg: "#ff4d5e",
	errorBg: "#4a1526",
	warningFg: "#ffb020",
	warningBg: "#47320d",
	tipFg: "#a78bfa",
	tipBg: "#2e2352",
	// Content
	fileFg: "#e6ecff",
	linkFg: "#4fc3ff",
	devFg: "#b48eff",
	dirFg: "#5c8cff",
	// Brand
	brandTinyFrom: "#4088ff",
	brandTinyTo: "#7cd0ff",
	brandCmdFrom: "#ffc233",
	brandCmdTo: "#ff7a1a",
}

// Constant: LIGHT
// The same palette tuned for light terminal backgrounds: deeper, saturated
// hues that hold their weight on white — navy structure, dark gold accents,
// burnt orange marks, violet devices and tips.
const LIGHT = {
	// Surfaces
	surfaceBg: "#e8ecf8",
	overlayBg: "#e8ecf8",
	mutedBg: "#d3dbf2",
	cursorBg: "#2f56b8",
	cursorInactiveBg: "#c6d1ee",
	selectionBg: "#c9d5f4",
	// Text
	textFg: "#101a33",
	textSecondaryFg: "#495785",
	textHeadingFg: "#0a1130",
	// Borders
	borderSecondaryFg: "#9aabd6",
	borderSecondaryActiveFg: "#926000",
	borderPrimaryFg: "#8c9cc9",
	borderPrimaryActiveFg: "#a06a00",
	// Accent
	accentFg: "#926000",
	accentBg: "#dbe4fb",
	accentSecondaryFg: "#c2410c",
	accentSecondaryBg: "#fbdcc2",
	// Semantics
	errorFg: "#d3234a",
	errorBg: "#fbd4dd",
	warningFg: "#b45309",
	warningBg: "#fce9c8",
	tipFg: "#6d28d9",
	tipBg: "#e6ddfb",
	// Content
	fileFg: "#101a33",
	linkFg: "#0369a1",
	devFg: "#7c3aed",
	dirFg: "#1d4ed8",
	// Brand
	brandTinyFrom: "#1d4ed8",
	brandTinyTo: "#3b82f6",
	brandCmdFrom: "#a16207",
	brandCmdTo: "#ea580c",
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
	brandTinyFrom: undefined,
	brandTinyTo: undefined,
	brandCmdFrom: undefined,
	brandCmdTo: undefined,
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
