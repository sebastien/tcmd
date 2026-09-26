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
// - `lineFg`: color/token for the summary text
// - `width(self)`: pane width in cells (0 when unknown)
// - `elide(text, width)`: truncate to the pane width

import { formatCounts, formatDisk } from "./format.js"
import { read } from "./read.js"

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
			const text = summaryText(read(data.entries), read(data.disk))
			return env.elide(text, env.width(self))
		},
		lineFg: () => env.lineFg,
	}
}

export { createBehaviors, summaryText }
