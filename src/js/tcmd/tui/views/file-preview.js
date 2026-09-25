// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/views/file-preview
// FilePreview: inline preview of the entry under the cursor. Text files show
// their leading content; other kinds show a metadata card (image, PDF, audio
// and video rendering are a later milestone).
//
// Data expected in scope: `preview` (cell of { kind, title, size, text } |
// null), `show` (cell of boolean).

import { ui } from "select.tui"
import { formatSize } from "../format.js"
import { theme } from "../theme.js"

const KIND_LABELS = {
	dir: "directory",
	image: "image",
	media: "audio/video",
	text: "text",
}

function readValue(value) {
	return value?.isReactive ? value.value : value
}

const FilePreview = ui(`
	<box when="show" title="previewTitle" titleFg="previewTitleColor" border flexDirection="column" flexGrow="1">
		<scrollbox flexGrow="1" height="100%">
			<text when="hasText" out="previewText" out:fg="textFg"></text>
			<text when="hasCard" out="cardText" out:fg="dimFg"></text>
		</scrollbox>
	</box>
`)
	.does({
		cardText: (_self, data) => {
			const preview = readValue(data.preview)
			if (!preview) return ""
			return `\n  ${KIND_LABELS[preview.kind] ?? "file"}: ${preview.title}\n  size: ${formatSize(preview.size)}\n`
		},
		dimFg: () => theme.dimFg,
		hasCard: (_self, data) => {
			const preview = readValue(data.preview)
			return Boolean(preview && preview.text === null)
		},
		hasText: (_self, data) => {
			const preview = readValue(data.preview)
			return Boolean(preview?.text)
		},
		previewText: (_self, data) => readValue(data.preview)?.text ?? "",
		previewTitle: (_self, data) => readValue(data.preview)?.title ?? "preview",
		previewTitleColor: () => theme.titleFg,
		show: (_self, data) => Boolean(readValue(data.show)),
		textFg: () => theme.textFg,
	})

export { FilePreview }

// EOF
