// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/FilePreview
// FilePreview: inline preview of the entry under the cursor. Text files show
// their leading content; other kinds show a metadata card. Renderer-agnostic
// logic; `FilePreview.xml` / `FilePreview.html` are the presentations.
//
// Environment: `textFg`, `textSecondaryFg`, `textHeadingFg`, and the optional
// `actions` footer text (default: the TUI's `[Open O] [Edit E]` hints; the web
// substitutes a note that those keys do not exist in a browser).

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

// Function: entryCard
// Metadata card for the entry the session did not preview: a directory, or a
// file whose kind has no inline preview.
function entryCard(entry) {
	if (!entry) return ""
	const lines = []
	lines.push("")
	lines.push(`  ${entry.isDir ? "directory" : "file"}: ${entry.name}${entry.isDir ? "/" : ""}`)
	if (entry.isDir) lines.push("  open it to list its contents")
	else lines.push(`  size: ${formatSize(entry.size)}`)
	lines.push("")
	return lines.join("\n")
}

// Function: headerTitle
// The inspector title: the preview's own title, else the cursor entry.
function headerTitle(preview, entry) {
	if (preview) return previewTitle(preview)
	if (entry) {
		const badge = entry.isDir ? "DIR" : (entry.ext || "file").toUpperCase()
		return `${entry.name}${entry.isDir ? "/" : ""}  <${badge}>`
	}
	return "inspector"
}

// Function: createBehaviors
// Builds the FilePreview behavior map for the given renderer environment.
// `env.actions` overrides the footer line so a presentation can carry its own
// copy (the browser has no Open/Edit); the default advertises the TUI keys.
function createBehaviors(env) {
	const actions = env.actions ?? (() => " [Open O] [Edit E]")
	return {
		actions,
		actionsFg: () => env.textSecondaryFg,
		cardText: (_self, data) => cardText(unwrap(data.preview)),
		dimFg: () => env.textSecondaryFg,
		emptyText: () => "  No file selected\n  Move the cursor or press v",
		entryText: (_self, data) => entryCard(unwrap(data.entry)),
		hasCard: (_self, data) => hasCard(unwrap(data.preview)),
		// The metadata card fills in whenever there is a cursor entry but no
		// preview payload (a directory, or a non-text file).
		hasEntryCard: (_self, data) => !unwrap(data.preview) && Boolean(unwrap(data.entry)),
		hasText: (_self, data) => hasText(unwrap(data.preview)),
		headerTitle: (_self, data) => headerTitle(unwrap(data.preview), unwrap(data.entry)),
		isEmpty: (_self, data) => !unwrap(data.preview) && !unwrap(data.entry),
		previewText: (_self, data) => unwrap(data.preview)?.text ?? "",
		previewTitle: (_self, data) => previewTitle(unwrap(data.preview)),
		previewTitleColor: () => env.textHeadingFg,
		show: (_self, data) => Boolean(unwrap(data.show)),
		textFg: () => env.textFg,
	}
}

export { cardText, createBehaviors, entryCard, hasCard, hasText, headerTitle, previewTitle }

// EOF
