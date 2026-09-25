// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/views/summary
// PathSummary: one compact line with entry counts and disk availability,
// truncated to the pane width.
//
// Data expected in scope: `entries` (cell of FileEntry[]), `disk`
// (cell of { free, total } | null).

import { ui } from "select.tui"
import { formatCounts, formatDisk } from "../format.js"
import { theme } from "../theme.js"

function readValue(value) {
	return value?.isReactive ? value.value : value
}

const Summary = ui(`
	<box ref="box" flexDirection="row" height="1">
		<text out="line" out:fg="lineFg"></text>
	</box>
`)
	.does({
		line: (self, data) => {
			const entries = readValue(data.entries) ?? []
			const disk = readValue(data.disk)
			let text = formatCounts(entries)
			const diskText = formatDisk(disk)
			if (diskText) text += ` · ${diskText}`
			// Truncate to the pane width once the layout has computed it
			// (width is 0 before the first layout pass).
			const width = Math.floor(self.ref.box?.width ?? 0)
			if (width >= 12 && text.length > width) {
				return `${text.slice(0, width - 1)}…`
			}
			return text
		},
		lineFg: () => theme.dimFg,
	})

export { Summary }

// EOF
