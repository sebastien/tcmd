// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tests/helpers/behavior-env
// Fake renderer environment shared by the component behavior tests: the union
// of the TUI color tokens and the web state classes, so one env drives both
// presentation bindings.

// Constant: behaviorEnv
const behaviorEnv = {
	accentFg: "accent",
	borderFg: "border",
	childClass: "is-child",
	cursorBg: "cursor",
	currentClass: "is-current",
	dimFg: "dim",
	dirClass: "is-dir",
	dirFg: "dir",
	lineFg: "dim",
	markFg: "mark",
	paletteBg: "palette",
	rootClass: "is-root",
	selectedClass: "selected",
	textFg: "text",
	titleFg: "title",
}

export { behaviorEnv }

// EOF
