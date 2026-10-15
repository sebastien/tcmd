// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/FilePreview
// FilePreview: inline preview of the entry under the cursor. Text files show
// their leading content; other kinds show a metadata card. Renderer-agnostic
// logic; `FilePreview.xml` / `FilePreview.html` are the presentations.
//
// A directory is the exception: it renders the *directory column* — its own
// breadcrumbs over a cursorable listing — so a previewed directory looks and
// behaves like a pane in every view mode (click a row to focus it, Enter to
// descend). The listing is the inspector pane's (`session.panes.preview`),
// threaded down as the `dir*` inputs; `paneId` is what rows, crumbs and the
// column body publish back to the App.
//
// Environment: `textFg`, `textSecondaryFg`, `textHeadingFg`, and the optional
// `actions` footer text (default: the TUI's `[Open O] [Edit E]` hints; the web
// substitutes a note that those keys do not exist in a browser).

import { unwrap } from "select/state/cells"
import { formatSize } from "./format.js"
import { previewSource } from "../core/preview.js"

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
// file whose kind has no inline preview. Directories normally take the
// directory column instead (see `isDirectoryPane`); the branch stays for a
// `stat` payload and for hosts that render no listing.
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

// Function: isDirectoryPane
// True when the inspector previews a plain directory: no `stat` card was
// pinned on it, so the directory column takes the body.
function isDirectoryPane(preview, entry) {
	return Boolean(entry?.isDir) && !preview
}

// Function: headerTitle
// The inspector title: the preview's own title, else the cursor entry — whose
// symlink target and resolved extension `previewSource` supplies, so the
// header names the traversal before the async read lands.
function headerTitle(preview, entry) {
	if (preview) return previewTitle(preview)
	if (entry) {
		const source = previewSource(entry)
		const badge = entry.isDir ? "DIR" : (source.ext || "file").toUpperCase()
		const name = entry.isDir ? `${entry.name}/` : entry.name
		const target = entry.isSymlink && entry.target ? ` -> ${entry.target}` : ""
		return `${name}${target}  <${badge}>`
	}
	return "inspector"
}

// Function: createBehaviors
// Builds the FilePreview behavior map for the given renderer environment.
// `env.actions` overrides the footer line so a presentation can carry its own
// copy (the browser has no Open/Edit); the default advertises the TUI keys.
function createBehaviors(env) {
	const actions = env.actions ?? (() => " [Open O] [Edit E]")
	const directory = (_self, data) =>
		isDirectoryPane(unwrap(data.preview), unwrap(data.entry))
	const body = (_self, data) => !directory(_self, data)
	return {
		actions,
		actionsFg: () => env.textSecondaryFg,
		cardText: (_self, data) => cardText(unwrap(data.preview)),
		// The directory column: breadcrumbs over the inspector pane's listing,
		// shaped like a pane header (a rule separates it from the body).
		dirCrumbsView: (_self, data) => ({ segments: data.dirSegments, paneId: data.paneId }),
		dirListView: (_self, data) => ({
			entries: data.dirEntries,
			cursor: data.dirCursor,
			marked: data.dirMarked,
			active: data.dirActive,
			loading: data.dirLoading,
			paneId: data.paneId,
		}),
		dimFg: () => env.textSecondaryFg,
		emptyText: () => "  No file selected\n  Move the cursor or press v",
		entryText: (_self, data) => entryCard(unwrap(data.entry)),
		// The rule between the contents and the shortcut footer.
		footRule: () => ["top"],
		footRuleFg: () => env.textSecondaryFg,
		headRule: () => ["top"],
		headRuleFg: () => env.textSecondaryFg,
		hasCard: (_self, data) => hasCard(unwrap(data.preview)),
		hasText: (_self, data) => hasText(unwrap(data.preview)),
		headerTitle: (_self, data) => headerTitle(unwrap(data.preview), unwrap(data.entry)),
		isEmpty: (_self, data) => !unwrap(data.preview) && !unwrap(data.entry),
		isDirPane: directory,
		previewText: (_self, data) => unwrap(data.preview)?.text ?? "",
		previewTitle: (_self, data) => previewTitle(unwrap(data.preview)),
		previewTitleColor: () => env.textHeadingFg,
		show: (_self, data) => Boolean(unwrap(data.show)),
		// One body at a time: the directory column, else the card/text/empty
		// states, with the title row yielding to the breadcrumb header.
		// `showEntryCard` fills in whenever there is a cursor entry but no
		// preview payload — except a directory, which gets the listing.
		showBody: body,
		showCard: (_self, data) => body(_self, data) && hasCard(unwrap(data.preview)),
		showEmpty: (_self, data) => body(_self, data) && !unwrap(data.preview) && !unwrap(data.entry),
		showEntryCard: (_self, data) =>
			body(_self, data) && !unwrap(data.preview) && Boolean(unwrap(data.entry)),
		showText: (_self, data) => body(_self, data) && hasText(unwrap(data.preview)),
		textFg: () => env.textFg,
	}
}

export {
	cardText,
	createBehaviors,
	entryCard,
	hasCard,
	hasText,
	headerTitle,
	isDirectoryPane,
	previewTitle,
}

// EOF
