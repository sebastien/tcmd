// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-16

// Module: tcmd/core/preview
// Preview classification and payload helpers, shared by the session's preview
// effect and by the commands that need to know how an entry previews — Enter
// opens a text file in `$EDITOR` and everything else in the fullscreen
// inspector (see `core/commands`). Pure and renderer-free: `previewKind` maps
// a resolved extension to a preview kind, `previewSource` resolves what a
// symlink previews *through*, and `hasBinaryByte` is the content sniff that
// turns a text head into a metadata card.

import { basename, extname } from "./path.js"

// Constant: PREVIEW_BYTES / SNIFF_BYTES
// Bytes of a text file the inspector reads for its inline body — the head
// budget every filesystem adapter defaults to — and the shorter opening run
// `hasBinaryByte` sniffs to call a body binary.
const PREVIEW_BYTES = 65536
const SNIFF_BYTES = 2048

// Constant: IMAGE_EXTS / MEDIA_EXTS
// Extensions with a dedicated (non-text) preview: they render as a metadata
// card, never as an editable text body.
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]
const MEDIA_EXTS = ["mp3", "wav", "ogg", "flac", "mp4", "webm", "mkv", "mov", "pdf"]

// Function: previewKind
// Preview classification for a resolved file extension; directories are not
// previewed (the caller passes their `null` ext). Takes the extension rather
// than the entry so a symlink classifies as what it points at.
function previewKind(ext) {
	if (ext && IMAGE_EXTS.includes(ext)) return "image"
	if (ext && MEDIA_EXTS.includes(ext)) return "media"
	return "text"
}

// Function: hasBinaryByte
// Content sniff: a text file's head carries no control byte in its opening
// run, so a hit here means the body is binary and previews as a card.
function hasBinaryByte(text) {
	for (let i = 0; i < SNIFF_BYTES && i < text.length; i++) {
		const code = text.charCodeAt(i)
		if (code < 9 || (code > 13 && code < 32)) return true
	}
	return false
}

// Function: previewSource
// What the preview renders *through* a symlink: `title` names the traversal
// (`notes -> ../real/notes`) so it is visible in the header, and `ext` is the
// target's extension, so a link previews with the kind of what it points at
// rather than the kind of its own name. Plain entries pass through unchanged.
function previewSource(entry) {
	const target = entry?.isSymlink && entry.target ? `${entry.target}` : null
	if (!target || !entry?.path) return { title: basename(entry?.path ?? ""), ext: entry?.ext ?? null }
	const ext = extname(target) ?? entry.ext ?? null
	return { title: `${basename(entry.path)} -> ${target}`, ext }
}

export { hasBinaryByte, PREVIEW_BYTES, previewKind, previewSource, SNIFF_BYTES }

// EOF
