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

// Constant: DARK
// Tokyo-Night-ish dark palette.
const DARK = {
	// Surfaces
	panelBg: "#1f2335",
	selectedBg: "#2f3b5c",
	cursorBg: "#3a5f8a",
	// Text
	textFg: "#c0caf5",
	dimFg: "#565f89",
	titleFg: "#a9b1d6",
	// Semantics: `errorFg` is the shared behaviors' failure color.
	accentFg: "#9ece6a",
	errorFg: "#f7768e",
	// Chrome
	borderFg: "#414868",
	frameBorderFg: "#565f89",
	// Listing
	dirFg: "#7aa2f7",
	markFg: "#e0af68",
	paletteBg: "#1f2335",
}

// Constant: LIGHT
// Palette tuned for light terminal backgrounds: darker, lower-chroma hues.
const LIGHT = {
	panelBg: "#e6e7ea",
	selectedBg: "#c4c8d6",
	cursorBg: "#9fb4d6",
	textFg: "#1f2335",
	dimFg: "#6b7089",
	titleFg: "#343b58",
	accentFg: "#33635c",
	borderFg: "#b7b9c4",
	frameBorderFg: "#8b8fa3",
	dirFg: "#3d59a1",
	markFg: "#8f5e15",
	errorFg: "#8c4351",
	paletteBg: "#e6e7ea",
}

// Constant: MONO
// No color at all: the terminal's own foreground/background. State is carried
// by markers (`>`, `*`, `[`, `]`, `▸`) and the selected-row background.
const MONO = {
	panelBg: undefined,
	selectedBg: undefined,
	cursorBg: undefined,
	textFg: undefined,
	dimFg: undefined,
	titleFg: undefined,
	accentFg: undefined,
	borderFg: undefined,
	frameBorderFg: undefined,
	dirFg: undefined,
	markFg: undefined,
	errorFg: undefined,
	paletteBg: undefined,
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
