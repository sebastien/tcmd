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
	accentBg: "accentBg",
	accentFg: "accent",
	accentSecondaryBg: "accentSecondaryBg",
	accentSecondaryFg: "mark",
	activeClass: "is-active",
	borderPrimaryActiveFg: "borderPrimaryActive",
	borderPrimaryFg: "frame",
	borderSecondaryActiveFg: "borderSecondaryActive",
	borderSecondaryFg: "border",
	childClass: "is-child",
	cursorBg: "cursor",
	cursorInactiveBg: "cursorInactive",
	currentClass: "is-current",
	devFg: "dev",
	dirClass: "is-dir",
	dirFg: "dir",
	errorBg: "errorBg",
	errorClass: "is-error",
	errorFg: "error",
	fileFg: "file",
	lineFg: "dim",
	linkFg: "link",
	mutedBg: "muted",
	overlayBg: "palette",
	rootClass: "is-root",
	selectedClass: "selected",
	selectionBg: "selected",
	textFg: "text",
	textHeadingFg: "title",
	textSecondaryFg: "dim",
	tipBg: "tipBg",
	tipFg: "tip",
	warningBg: "warningBg",
	warningFg: "warning",
}

export { behaviorEnv }

// EOF
