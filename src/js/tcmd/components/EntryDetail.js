// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-06

// Module: tcmd/components/EntryDetail
// EntryDetail: the detail block for the entry under a pane's cursor, shown just
// above that pane's summary (directory) row. Two lines, each split into coloured
// slots so the file type and the permission mode stand out:
//
// - line 1: mtime · type · size (what a listing can always carry);
// - line 2: ctime · owner · mode (stat-only; empty on backends that do not
//   expose them, e.g. OPFS).
//
// The dim lead/tail slots fold in their own separator, so a slot that is absent
// (`when`-hidden) takes no width and the next field still reads cleanly. The
// line builders return the joined string (tests, single-slot renderers); the
// slot behaviors slice it for the templates. `owner` resolves uid/gid through
// the optional environment hook; `typeColor` mirrors the listing colours.
// Renderer-agnostic logic; the `.xml` / `.html` presentations provide layout.

import { unwrap } from "select/state/cells"
import { formatMode, formatSize, formatTime } from "./format.js"

// Constant: KIND_LABELS
// Human labels for the entry-kind markers on line 1.
const KIND_LABELS = { file: "file", directory: "dir", symlink: "link", device: "dev" }

// Constant: SEP
// Field delimiter, spaces included.
const SEP = " · "

// Constant: INDENT
// Leading inset applied to the first field of each line.
const INDENT = "  "

// Function: entryKind
// "file" | "directory" | "symlink" | "device" for an entry.
function entryKind(entry) {
	if (entry?.isSymlink) return "symlink"
	if (entry?.isDir) return "directory"
	if (entry?.isDevice) return "device"
	return "file"
}

// Function: typeColor
// The listing colour for an entry's kind, mirroring `FileRow.nameFg`.
function typeColor(entry, env) {
	const kind = entryKind(entry)
	if (kind === "symlink") return env.linkFg
	if (kind === "directory") return env.dirFg
	if (kind === "device") return env.devFg
	return env.fileFg
}

// Function: detailSegments
// Line 1 as `{ lead, type, tail }`: the dim `lead` carries the indent, mtime and
// its separator; `type` is the coloured kind; the dim `tail` carries the size's
// separator and the size. Joined, they rebuild `detailLine`.
function detailSegments(entry) {
	if (!entry) return { lead: "", tail: "", type: "" }
	const time = formatTime(entry.mtimeMs)
	const size = entry.isDir ? "" : formatSize(entry.size)
	return {
		lead: time ? `${INDENT}${time}${SEP}` : INDENT,
		type: KIND_LABELS[entryKind(entry)],
		tail: size ? `${SEP}${size}` : "",
	}
}

// Function: metaSegments
// Line 2 as `{ lead, owner, sep, mode }`: the dim `lead` carries the indent,
// ctime and its separator; `owner` is the dim owner; `sep` is the dim separator
// before the mode; `mode` is the brightened permission string. The owner/mode
// carry the indent when they are the first field.
function metaSegments(entry, ownerOf) {
	if (!entry) return { lead: "", mode: "", owner: "", sep: "" }
	const time = formatTime(entry.ctimeMs)
	const owner = (ownerOf ? ownerOf(entry) : entry.owner) || ""
	const mode = formatMode(entry.mode)
	return {
		lead: time ? `${INDENT}${time}${owner || mode ? SEP : ""}` : "",
		owner: owner ? `${time ? "" : INDENT}${owner}` : "",
		sep: owner && mode ? SEP : "",
		mode: mode ? `${time || owner ? "" : INDENT}${mode}` : "",
	}
}

// Function: detailLine
// Joined "mtime · type · size" line: the always-available half of the detail.
function detailLine(entry) {
	const segments = detailSegments(entry)
	return `${segments.lead}${segments.type}${segments.tail}`
}

// Function: metaLine
// Joined "ctime · owner · mode" line; empty when the backend exposes none.
function metaLine(entry, ownerOf) {
	const segments = metaSegments(entry, ownerOf)
	return `${segments.lead}${segments.owner}${segments.sep}${segments.mode}`
}

// Function: createBehaviors
// Builds the EntryDetail behavior map for the given renderer environment.
// `ownerOf(entry)` is an optional uid/gid -> owner-name resolver; the fg
// behaviors resolve through the injected tokens (undefined on the web, which
// colours via classes instead).
function createBehaviors(env = {}) {
	const ownerOf = env.ownerOf
	const detail = (_self, data) => detailSegments(unwrap(data.entry))
	const meta = (_self, data) => metaSegments(unwrap(data.entry), ownerOf)
	return {
		// Separator rule between the listing and the detail block.
		detailBorder: () => ["top"],
		detailBorderFg: () => env.textSecondaryFg,
		dimFg: () => env.textSecondaryFg,

		// Line 1 slots: lead (dim) · type (coloured) · tail (dim).
		detailLead: (_self, data) => detail(_self, data).lead,
		detailHasLead: (_self, data) => Boolean(detail(_self, data).lead),
		detailType: (_self, data) => detail(_self, data).type,
		detailTypeClass: (_self, data) => `is-${entryKind(unwrap(data.entry))}`,
		detailTypeFg: (_self, data) => typeColor(unwrap(data.entry), env),
		detailTail: (_self, data) => detail(_self, data).tail,
		detailHasTail: (_self, data) => Boolean(detail(_self, data).tail),

		// Line 2 slots: lead · owner · sep (dim) · mode (brightened).
		metaLead: (_self, data) => meta(_self, data).lead,
		metaHasLead: (_self, data) => Boolean(meta(_self, data).lead),
		metaOwner: (_self, data) => meta(_self, data).owner,
		metaHasOwner: (_self, data) => Boolean(meta(_self, data).owner),
		metaSep: (_self, data) => meta(_self, data).sep,
		metaHasSep: (_self, data) => Boolean(meta(_self, data).sep),
		metaMode: (_self, data) => meta(_self, data).mode,
		metaHasMode: (_self, data) => Boolean(meta(_self, data).mode),
		metaModeFg: () => env.accentFg,

		// Whole-line fallbacks for single-slot renderers.
		detailLine: (_self, data) => detailLine(unwrap(data.entry)),
		detailFg: () => env.textSecondaryFg,
		hasEntry: (_self, data) => Boolean(unwrap(data.entry)),
		metaLine: (_self, data) => metaLine(unwrap(data.entry), ownerOf),
		metaFg: () => env.textSecondaryFg,
	}
}

export {
	KIND_LABELS,
	createBehaviors,
	detailLine,
	detailSegments,
	entryKind,
	metaLine,
	metaSegments,
	typeColor,
}

// EOF
