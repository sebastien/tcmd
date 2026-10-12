// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/header
// Header: the slim application identity bar, showing `TinyCmd - HOST`.
// The brand renders as static spans — `Tiny` with a blue CSS gradient, `Cmd`
// with a brighter orange one (both kept in sync with `tui/theme.js`) — so the
// `title` behavior carries only the host tail (` - HOST`).
//
// Environment: `textHeadingFg`.

import { unwrap } from "select/state/cells"

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
	}
}

export { BRAND, createBehaviors }

// EOF
