// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/BookmarkList
// BookmarkList: the single bookmarks panel opened with `b`. The input filters
// the stored bookmarks (matched by name or path); the first row offers to add
// the current path when it is not bookmarked yet. The row logic lives in
// `BookmarkRow.js`; this parent maps its `items` to rows.
//
// Environment: `overlayBg`, `borderPrimaryActiveFg`, `textSecondaryFg`
// (footer), `textHeadingFg` (title), `rows(data)` returning the keyed rows and
// `scrollTop(self, data)` (TUI viewport tracking).

import { unwrap } from "select/state/cells"

// Function: createBehaviors
// Builds the BookmarkList behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		bg: () => env.overlayBg,
		borderFg: () => env.borderPrimaryActiveFg,
		confirm: (self) => self.pub("bookmark:confirm"),
		footer: () => "↑↓ move   ⌫/Del remove   ↵ open   Esc close",
		footerFg: () => env.textSecondaryFg,
		// The filter input owns typing; the list navigates with the arrows.
		focused: (_self, data) => Boolean(unwrap(data.open)),
		open: (_self, data) => Boolean(unwrap(data.open)),
		sign: () => "›",
		title: () => "bookmarks",
		titleColor: () => env.textHeadingFg,
		emptyList: (_self, data) => (unwrap(data.items)?.length ?? 0) === 0,
		empty: (_self, data) =>
			`${unwrap(data.query) ?? ""}`.trim() ? "  no matching bookmarks" : "  no bookmarks",
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

export { createBehaviors }
