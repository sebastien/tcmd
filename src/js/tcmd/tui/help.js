// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-02

// Module: tcmd/tui/help
// TUI-only behavior for the `?` key reference overlay. The content is built
// from the live keymap and command registry (see `tui/frame.js`), so it
// cannot drift from the actual bindings.

import { unwrap } from "select/state/cells"
import { helpLines } from "./frame.js"

// Function: createBehaviors
// Builds the Help behavior map for the given TUI environment.
function createBehaviors(env) {
	return {
		bg: () => env.theme.surfaceBg,
		borderFg: () => env.theme.borderPrimaryActiveFg,
		dimFg: () => env.theme.textSecondaryFg,
		hint: () => " Esc / ? close ",
		open: (_self, data) => Boolean(unwrap(data.open)),
		text: () => helpLines().join("\n"),
		textFg: () => env.theme.textFg,
		title: () => " Keys ",
		titleFg: () => env.theme.textHeadingFg,
	}
}

export { createBehaviors }

// EOF
