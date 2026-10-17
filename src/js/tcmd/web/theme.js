// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/web/theme
// Web presentation tokens. Colors are expressed as CSS classes, so the web
// theme only carries the state classes the shared behaviors bind through
// `out:class`; the TUI colors live in `tui/theme.js`.

const webTheme = {
	activeClass: "is-active",
	childClass: "is-child",
	currentClass: "is-current",
	dirClass: "is-dir",
	errorClass: "is-error",
	execClass: "is-exec",
	focusedClass: "is-focused",
	lucideIcons: true,
	readonlyClass: "is-readonly",
	rootClass: "is-root",
	selectedClass: "is-selected",
}

export { webTheme }

// EOF
