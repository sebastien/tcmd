// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/Summary
// PathSummary: one compact line with entry counts and disk availability.
// Renderer-agnostic logic; `Summary.xml` / `Summary.html` provide the TUI and
// web presentations. Behaviors receive plain (unwrapped) data.
//
// Environment (injected by the renderer binding):
// - `lineFg`: color/token for the summary text (bound by the TUI presentation)
// - `width(self)`: pane width in cells (optional; defaults to 0)
// - `elide(text, width)`: truncate to the pane width (optional; defaults to
//   the full text)

import { unwrap } from "select/state/cells"
import { formatCounts, formatDisk } from "./format.js"

// Function: summaryText
// The full, untruncated summary line for `entries` and `disk`.
function summaryText(entries, disk) {
	let text = formatCounts(entries)
	const diskText = formatDisk(disk)
	if (diskText) text += ` · ${diskText}`
	return text
}

// Function: createBehaviors
// Builds the Summary behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		line: (self, data) => {
			const text = summaryText(unwrap(data.entries), unwrap(data.disk))
			const width = env.width ? env.width(self) : 0
			return env.elide ? env.elide(text, width) : text
		},
		lineFg: () => env.lineFg,
	}
}

export { createBehaviors, summaryText }

// EOF
