// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/web/theme
// Web presentation tokens. Colors are expressed as CSS classes; the shared
// behaviors still receive the color keys they use for the TUI (ignored here).

const webTheme = {
	// CSS state classes consumed by the .html templates.
	childClass: "is-child",
	currentClass: "is-current",
	dirClass: "is-dir",
	rootClass: "is-root",
	selectedClass: "is-selected",
	// TUI-only color keys; the web templates use CSS instead.
	accentFg: null,
	borderFg: null,
	cursorBg: null,
	dimFg: null,
	dirFg: null,
	errorFg: null,
	lineFg: null,
	markFg: null,
	paletteBg: null,
	textFg: null,
	titleFg: null,
}

export { webTheme }
