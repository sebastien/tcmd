// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/header
// Header: the application title bar above the panes, showing
// `TinyCmd - HOST DIR/BASE` for the active pane's directory (compressed to fit).
// The brand renders as static spans — `Tiny` with a blue CSS gradient, `Cmd`
// with a brighter orange one (both kept in sync with `tui/theme.js`) — so the
// `title` behavior carries only the host and path tail (` - HOST DIR/BASE`).
//
// Environment: `textHeadingFg`, plus `width(self)` returning the available
// columns (renderer-specific; 0/omitted disables compression).

import { unwrap } from "select/state/cells"
import { formatTitle } from "../components/format.js"

// Constant: BRAND
// The brand word the static header spans render; stripped from the title so
// the tail doesn't repeat it.
const BRAND = "TinyCmd"

// Function: createBehaviors
// Builds the Header behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		title: (self, data) => {
			const full = formatTitle(unwrap(data.host), unwrap(data.path), env.width ? env.width(self, data) : 0)
			return full.startsWith(BRAND) ? full.slice(BRAND.length) : full
		},
		titleFg: () => env.textHeadingFg,
	}
}

export { BRAND, createBehaviors }

// EOF
