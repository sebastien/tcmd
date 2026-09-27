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

import { unwrap } from "select/state/cells"
import { formatSize } from "./format.js"

const KIND_LABELS = {
	directory: "directory",
	image: "image",
	media: "audio/video",
	text: "text",
}

// Function: cardText
// Metadata card for non-text previews; `preview.details` (set by `stat`) adds
// one indented line each.
function cardText(preview) {
	if (!preview) return ""
	const lines = []
	lines.push("")
	lines.push(`  ${KIND_LABELS[preview.kind] ?? "file"}: ${preview.title}`)
	lines.push(`  size: ${formatSize(preview.size)}`)
	for (const detail of preview.details ?? []) lines.push(`  ${detail}`)
	lines.push("")
	return lines.join("\n")
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

// Function: previewTitle
// "Filename <EXT>" style title; falls back to the kind label when the file has
// no extension.
function previewTitle(preview) {
	if (!preview) return "preview"
	const badge = (preview.ext || KIND_LABELS[preview.kind] || "file").toUpperCase()
	return `${preview.title}  <${badge}>`
}

// Function: createBehaviors
// Builds the FilePreview behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		actions: () => "[O]pen [E]dit",
		actionsFg: () => env.dimFg,
		cardText: (_self, data) => cardText(unwrap(data.preview)),
		dimFg: () => env.dimFg,
		hasCard: (_self, data) => hasCard(unwrap(data.preview)),
		hasText: (_self, data) => hasText(unwrap(data.preview)),
		previewText: (_self, data) => unwrap(data.preview)?.text ?? "",
		previewTitle: (_self, data) => previewTitle(unwrap(data.preview)),
		previewTitleColor: () => env.titleFg,
		show: (_self, data) => Boolean(unwrap(data.show)),
		textFg: () => env.textFg,
	}
}

export { cardText, createBehaviors, hasCard, hasText, previewTitle }

// EOF
