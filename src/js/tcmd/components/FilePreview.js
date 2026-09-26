// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/FilePreview
// FilePreview: inline preview of the entry under the cursor. Text files show
// their leading content; other kinds show a metadata card. Renderer-agnostic
// logic; `FilePreview.xml` / `FilePreview.html` are the presentations.
//
// Environment: `textFg`, `dimFg`, `titleFg`.

import { formatSize } from "./format.js"
import { read } from "./read.js"

const KIND_LABELS = {
	dir: "directory",
	image: "image",
	media: "audio/video",
	text: "text",
}

// Function: cardText
// Metadata card for non-text previews.
function cardText(preview) {
	if (!preview) return ""
	return `\n  ${KIND_LABELS[preview.kind] ?? "file"}: ${preview.title}\n  size: ${formatSize(preview.size)}\n`
}

// Function: hasCard
// True when the preview is a metadata card (no text body).
function hasCard(preview) {
	return Boolean(preview && preview.text === null)
}

// Function: hasText
// True when the preview carries a text body.
function hasText(preview) {
	return Boolean(preview?.text)
}

// Function: createBehaviors
// Builds the FilePreview behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		cardText: (_self, data) => cardText(read(data.preview)),
		dimFg: () => env.dimFg,
		hasCard: (_self, data) => hasCard(read(data.preview)),
		hasText: (_self, data) => hasText(read(data.preview)),
		previewText: (_self, data) => read(data.preview)?.text ?? "",
		previewTitle: (_self, data) => read(data.preview)?.title ?? "preview",
		previewTitleColor: () => env.titleFg,
		show: (_self, data) => Boolean(read(data.show)),
		textFg: () => env.textFg,
	}
}

export { cardText, createBehaviors, hasCard, hasText }
