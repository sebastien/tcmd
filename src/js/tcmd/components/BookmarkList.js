// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/BookmarkList
// BookmarkList: the `g`/`b` overlay. In "name" mode it shows an input to name
// the path being recorded; in "list" mode it shows the fuzzy picker over the
// stored bookmarks (matched by name or path). The row logic lives in
// `BookmarkRow.js`; this parent maps its `items` to rows.
//
// Environment: `overlayBg`, `borderPrimaryActiveFg`, `textSecondaryFg`
// (footer/path), `textHeadingFg` (title), `rows(data)` returning the keyed rows
// and `scrollTop(self, data)` (TUI viewport tracking).

import { unwrap } from "select/state/cells"

// Function: title
// The overlay title: "bookmark" while naming, "bookmarks" while picking.
function bookmarkTitle(mode) {
	return unwrap(mode) === "name" ? "bookmark" : "bookmarks"
}

// Function: footer
function bookmarkFooter(mode) {
	return unwrap(mode) === "name"
		? "name the bookmark   ↵ save   Esc cancel"
		: "↑↓ move   ↵ jump   Esc close"
}

// Function: targetLine
// The path being recorded (name mode). `target` is `{ path, isDir }` or null.
function targetLine(target) {
	const value = unwrap(target)
	if (!value) return ""
	if (typeof value === "string") return value
	return `${value.path ?? ""}${value.isDir === true ? "/" : ""}`
}

// Function: createBehaviors
// Builds the BookmarkList behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		bg: () => env.overlayBg,
		borderFg: () => env.borderPrimaryActiveFg,
		confirm: (self, data) => self.pub("bookmark:confirm"),
		footer: (_self, data) => bookmarkFooter(data.mode),
		footerFg: () => env.textSecondaryFg,
		// The input is focused/typing in name mode; the list navigates otherwise.
		focused: (_self, data) => Boolean(unwrap(data.open)),
		inputVisible: (_self, data) => unwrap(data.mode) === "name",
		listVisible: (_self, data) => unwrap(data.mode) === "list",
		open: (_self, data) => Boolean(unwrap(data.open)),
		pathFg: () => env.textSecondaryFg,
		sign: (_self, data) => (unwrap(data.mode) === "name" ? "+" : "›"),
		target: (_self, data) => targetLine(data.target),
		title: (_self, data) => bookmarkTitle(data.mode),
		titleColor: () => env.textHeadingFg,
		emptyList: (_self, data) =>
			unwrap(data.mode) === "list" && (unwrap(data.items)?.length ?? 0) === 0,
		empty: () => "  no bookmarks",
		emptyFg: () => env.textSecondaryFg,
	}
	if (env?.rows) {
		behaviors.rows = (self, data) => env.rows(self, data)
	}
	if (env?.scrollTop) {
		behaviors.scrollTop = (self, data) => env.scrollTop(self, data)
	}
	return behaviors
}

export { bookmarkTitle, createBehaviors }
