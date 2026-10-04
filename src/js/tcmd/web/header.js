// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/header
// Header: the application title bar above the panes, showing
// `TinyCmd - HOST DIR/BASE` for the active pane's directory (compressed to fit).
// Web-only: the TUI carries the same identity in the frame border title.
//
// Environment: `textHeadingFg`, plus `width(self)` returning the available
// columns (renderer-specific; 0/omitted disables compression).

import { unwrap } from "select/state/cells"
import { formatTitle } from "../components/format.js"

// Function: createBehaviors
// Builds the Header behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		title: (self, data) =>
			formatTitle(unwrap(data.host), unwrap(data.path), env.width ? env.width(self, data) : 0),
		titleFg: () => env.textHeadingFg,
	}
}

export { createBehaviors }

// EOF
