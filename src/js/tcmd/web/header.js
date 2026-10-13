// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/header
// Header: the slim application identity bar, showing `TinyCmd - HOST` and,
// right-aligned, the view mode and version (`explorer · 0.1.3`).
// The brand renders as static spans — `Tiny` with a blue CSS gradient, `Cmd`
// with a brighter orange one (both kept in sync with `tui/theme.js`) — so the
// `title` behavior carries only the host tail (` - HOST`), `mode`/`modeClass`
// the gradiented mode word and `statusSuffix` the version that follows it.
//
// Environment: `textHeadingFg`.

import { unwrap } from "select/state/cells"
import { modeWord, versionTrail } from "../components/Frame.js"

// Constant: BRAND
// The brand word the static header spans render.
const BRAND = "TinyCmd"

// Function: createBehaviors
// Builds the Header behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		title: (_self, data) => {
			const host = `${unwrap(data.host) ?? ""}`.trim()
			return host ? ` - ${host}` : ""
		},
		titleFg: () => env.textHeadingFg,
		// The mode word picks the brand gradient it shimmers along: explorer
		// the Tiny blues, commander the Cmd oranges (see `.app-header-mode`).
		mode: (_self, data) => modeWord(unwrap(data.mode)),
		modeClass: (_self, data) => `mode-${modeWord(unwrap(data.mode))}`,
		statusSuffix: () => versionTrail(),
	}
}

export { BRAND, createBehaviors }

// EOF
