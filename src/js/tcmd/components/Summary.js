// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/Summary
// PathSummary: one compact line with entry counts and disk availability.
// Renderer-agnostic logic; `Summary.xml` / `Summary.html` provide the TUI and
// web presentations.
//
// Environment (injected by the renderer binding):
// - `lineFg`: color/token for the summary text (bound by the TUI presentation)
// - `width(self)`: pane width in cells (optional; defaults to 0)
// - `elide(text, width)`: truncate to the pane width (optional; defaults to
//   the full text)
// - `measure(text)`: display width of `text` (optional; defaults to
//   `text.length`)

import { unwrap } from "select/state/cells"
import { formatCounts, formatDisk, formatSize } from "./format.js"

// Constant: INDENT
// Leading inset so the summary aligns with the detail line above it.
const INDENT = "  "

// Function: summaryText
// The full, untruncated summary line for `entries` and `disk`.
function summaryText(entries, disk) {
	let text = formatCounts(entries)
	const diskText = formatDisk(disk)
	if (diskText) text += ` · ${diskText}`
	return `${INDENT}${text}`
}

// Function: summaryCounts
// Just the counts part, the first thing a summary drops information for.
function summaryCounts(entries) {
	return formatCounts(entries)
}

// Function: summaryShortDisk
// Compact disk availability, e.g. "12G free".
function summaryShortDisk(disk) {
	return disk ? `${formatSize(disk.free)} free` : ""
}

// Function: createBehaviors
// Builds the Summary behavior map for the given renderer environment.
function createBehaviors(env) {
	const measure = env.measure ?? ((text) => `${text}`.length)
	return {
		lineFg: () => env.lineFg,
		// TUI: degrade by information value instead of chopping mid-token:
		// full line -> short disk -> counts only -> elided counts.
		priorityLine: (self, data) => {
			const entries = unwrap(data.entries)
			const disk = unwrap(data.disk)
			const width = env.width ? env.width(self, data) : 0
			const full = summaryText(entries, disk)
			if (!width || measure(full) <= width) return full
			const counts = `${INDENT}${summaryCounts(entries)}`
			const short = disk ? `${counts} · ${summaryShortDisk(disk)}` : counts
			if (measure(short) <= width) return short
			if (measure(counts) <= width) return counts
			return env.elide ? env.elide(counts, width) : counts
		},
	}
}

export { createBehaviors, summaryCounts, summaryShortDisk, summaryText }

// EOF
