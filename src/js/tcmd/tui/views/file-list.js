// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/views/file-list
// FileList: the scrollable, cursorable list of entries for one pane. A pure
// view over the pane model: it receives reactive data through `in:` slots and
// publishes `list:select` events with `{ paneId, index }` payloads; the app
// maps them to commands.
//
// Data expected in scope:
// - `entries`: cell of FileEntry[] (the filtered/sorted view)
// - `cursor`: cell of number
// - `marked`: cell of Set<path>
// - `paneId`: string

import { ui } from "select.tui"
import { formatSize } from "../format.js"
import { theme } from "../theme.js"

// Function: readValue
// Unwraps cell-or-plain values passed through `in:` slots.
function readValue(value) {
	return value?.isReactive ? value.value : value
}

const FileList = ui(`
	<box flexDirection="column" flexGrow="1">
		<scrollbox ref="list" flexGrow="1" height="100%" out:scrollTop="scrollTop">
			<box each="entries" each:key="name" on:click="paneId:paneId,index:index!list:select">
				<box flexDirection="row" height="1" out:backgroundColor="rowBg">
					<text out="rowMarker" width="2" out:fg="rowMarkerFg"></text>
					<text out="rowName" flexGrow="1" out:fg="rowNameFg"></text>
					<text out="rowSize" width="9" out:fg="rowSizeFg"></text>
				</box>
			</box>
		</scrollbox>
	</box>
`)
	.does({
		rowBg: (_self, data) => (data.index === readValue(data.cursor) ? theme.cursorBg : undefined),
		rowMarker: (_self, data) =>
			readValue(data.marked)?.has?.(data.item.path) ? "* " : data.index === readValue(data.cursor) ? "> " : "  ",
		rowMarkerFg: (_self, data) => (readValue(data.marked)?.has?.(data.item.path) ? theme.markFg : theme.accentFg),
		rowName: (_self, data) => (data.item.isDir ? `${data.item.name}/` : data.item.name),
		rowNameFg: (_self, data) => (data.item.isDir ? theme.dirFg : theme.textFg),
		rowSize: (_self, data) => (data.item.isDir ? "<dir>" : formatSize(data.item.size)),
		rowSizeFg: () => theme.dimFg,
		// Keeps the cursor row inside the scrollbox viewport.
		scrollTop: (self, data) => {
			const box = self.ref.list
			if (!box || !box.height) return box?.scrollTop ?? 0
			const cursor = readValue(data.cursor) ?? 0
			const view = Math.max(1, Math.floor(box.height))
			const top = box.scrollTop ?? 0
			if (cursor < top) return cursor
			if (cursor >= top + view) return cursor - view + 1
			return top
		},
	})

export { FileList }

// EOF
