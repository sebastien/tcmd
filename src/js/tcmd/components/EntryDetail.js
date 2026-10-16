// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-06

// Module: tcmd/components/EntryDetail
// EntryDetail: the detail line for the entry under a pane's cursor, shown just
// above that pane's summary (directory) row. A single line,
// `selected · date · type · size · rights`:
//
// - `selected` (the pane's marked count, above one) leads in the mark colour;
// - `date` (mtime) and `size` are the numeric fields, drawn bright;
// - `type` (file/dir/link/dev) is coloured like the listing, a plain file
//   taking its executable/read-only colour too;
// - `rights` (permission mode) is accented.
//
// When the pane is too narrow the trailing blocks give way first (`rights`,
// then `size`), keeping the date and type; the last block is elided if it
// still overflows. Directories drop the size (they have none). Each block and
// its separating rule is a separate slot so the pieces can carry their own
// colour. Renderer-agnostic logic; the `.xml` / `.html` presentations lay it
// out.

import { unwrap } from "select/state/cells"
import { isExecutable, isReadonly, nameFg } from "./FileRow.js"
import { formatMode, formatSize, formatTime } from "./format.js"

// Constant: KIND_LABELS
// Human labels for the entry-kind markers.
const KIND_LABELS = { file: "file", directory: "dir", symlink: "link", device: "dev" }

// Constant: SEP
// Field delimiter, spaces included.
const SEP = " · "

// Constant: INDENT
// Leading inset applied to the line.
const INDENT = "  "

// Constant: MIN_GAP
// Least gap kept between the left fields and the right-aligned rights.
const MIN_GAP = 2

// Function: entryKind
// "file" | "directory" | "symlink" | "device" for an entry.
function entryKind(entry) {
	if (entry?.isSymlink) return "symlink"
	if (entry?.isDir) return "directory"
	if (entry?.isDevice) return "device"
	return "file"
}

// Function: typeColor
// The listing colour for an entry's kind, delegating to `FileRow.nameFg` so
// the detail's type reads exactly like the row's name — directory, symlink and
// device kinds, plus the executable/read-only states of a plain file.
function typeColor(entry, env) {
	return nameFg(entry, env)
}

// Function: typeClass
// The web state classes for the detail's type span: the kind's `is-<kind>`
// class, plus the executable/read-only class when the entry is a plain file
// (mirroring `FileRow.nameClass`, but on the type-specific `is-<kind>` base).
function typeClass(entry, env) {
	const kind = entryKind(entry)
	const base = `is-${kind}`
	if (kind !== "file") return base
	if (isExecutable(entry)) return `${base} ${env.execClass}`
	if (isReadonly(entry)) return `${base} ${env.readonlyClass}`
	return base
}

// Function: detailBlocks
// The ordered `{ key, text }` blocks for an entry: the marked count (when more
// than one item is selected), date, type, size (files only) and rights,
// skipping any empty one.
function detailBlocks(entry, markedCount = 0) {
	const blocks = []
	if (markedCount > 1) blocks.push({ key: "marked", text: `${markedCount} selected` })
	if (!entry) return blocks
	const time = formatTime(entry.mtimeMs)
	if (time) blocks.push({ key: "time", text: time })
	blocks.push({ key: "type", text: KIND_LABELS[entryKind(entry)] })
	if (!entry.isDir) blocks.push({ key: "size", text: formatSize(entry.size) })
	const mode = formatMode(entry.mode)
	if (mode) blocks.push({ key: "mode", text: mode })
	return blocks
}

// Function: joinBlocks
// Joins blocks with the field separator.
function joinBlocks(blocks) {
	return blocks.map((block) => block.text).join(SEP)
}

// Function: fitBlocks
// Reserves the rights on the right and fits the left fields (date, type, size)
// into the remaining room. When the pane is too narrow the size drops first,
// then the rights, and the last left block is elided if it still overflows.
// Returns the kept blocks in display order; `width <= 0` disables fitting.
function fitBlocks(blocks, width, measure, elide) {
	if (width <= 0) return blocks
	const mode = blocks.find((block) => block.key === "mode") ?? null
	let left = blocks.filter((block) => block.key !== "mode")
	const fits = (list, avail) => measure(`${INDENT}${joinBlocks(list)}`) <= avail
	const dropSize = () => {
		left = left.filter((block) => block.key !== "size")
	}

	// Keep the rights pinned right if the left fields still fit beside them.
	let keptMode = mode
	if (keptMode) {
		const reserve = measure(`${SEP}${keptMode.text}`) + MIN_GAP
		if (!fits(left, width - reserve)) dropSize()
		if (!fits(left, width - reserve)) keptMode = null
	}

	const avail = keptMode ? width - measure(`${SEP}${keptMode.text}`) - MIN_GAP : width
	if (!fits(left, avail)) dropSize()
	if (!fits(left, avail) && elide && left.length) {
		const last = left[left.length - 1]
		const head = left.slice(0, -1)
		const headText = head.length ? `${INDENT}${joinBlocks(head)}${SEP}` : INDENT
		left = [...head, { ...last, text: elide(last.text, Math.max(1, avail - measure(headText))) }]
	}
	return keptMode ? [...left, keptMode] : left
}

// Function: detailLine
// Joined `selected · date · type · size · rights` line (the reference the
// tests assert against; the templates render the fitted slots instead).
function detailLine(entry, markedCount = 0) {
	const blocks = detailBlocks(entry, markedCount)
	return blocks.length ? `${INDENT}${joinBlocks(blocks)}` : ""
}

// Function: createBehaviors
// Builds the EntryDetail behavior map for the given renderer environment.
// `width(self)` / `measure` / `elide` are the optional viewport hooks; the
// numeric fields resolve through `env.textFg` (bright), the type through
// `typeColor`, the rights through `env.accentFg`, and the selected count
// through `env.accentSecondaryFg` (the mark colour).
function createBehaviors(env = {}) {
	const measure = env.measure ?? ((text) => `${text}`.length)
	// Fitted slot state for the current entry; recomputed per behavior call.
	const layout = (self, data) => {
		const entry = unwrap(data.entry)
		const marked = unwrap(data.marked)
		const markedCount = marked?.size ?? 0
		const width = env.width ? env.width(self, data) : 0
		const kept = fitBlocks(detailBlocks(entry, markedCount), width, measure, env.elide)
		const keys = new Set(kept.map((block) => block.key))
		const texts = {}
		for (const block of kept) texts[block.key] = block.text
		return { entry, keys, texts }
	}
	const has = (self, data, key) => layout(self, data).keys.has(key)
	const text = (self, data, key) => layout(self, data).texts[key] ?? ""
	const before = (self, data, key) => {
		const keys = layout(self, data).keys
		const order = ["marked", "time", "type", "size", "mode"]
		const index = order.indexOf(key)
		return order.slice(0, index).some((earlier) => keys.has(earlier))
	}
	return {
		// Separator rule between the listing and the detail line.
		detailBorder: () => ["top"],
		detailBorderFg: () => env.textSecondaryFg,
		dimFg: () => env.textSecondaryFg,
		brightFg: () => env.textFg,

		// The line: indent + selected count + date + type + size + rights,
		// each gated so a dropped block takes no width.
		detailHasIndent: (self, data) => layout(self, data).keys.size > 0,
		detailIndent: () => INDENT,
		detailHasMarked: (self, data) => has(self, data, "marked"),
		detailMarked: (self, data) => text(self, data, "marked"),
		detailMarkedFg: () => env.accentSecondaryFg,
		detailHasTime: (self, data) => has(self, data, "time"),
		detailTime: (self, data) => text(self, data, "time"),
		detailHasType: (self, data) => has(self, data, "type"),
		detailType: (self, data) => text(self, data, "type"),
		detailTypeClass: (_self, data) => typeClass(unwrap(data.entry), env),
		detailTypeFg: (_self, data) => typeColor(unwrap(data.entry), env),
		detailHasSize: (self, data) => has(self, data, "size"),
		detailSize: (self, data) => text(self, data, "size"),
		detailHasMode: (self, data) => has(self, data, "mode"),
		detailMode: (self, data) => text(self, data, "mode"),
		detailModeFg: () => env.accentFg,
		detailSepTime: (self, data) => has(self, data, "time") && before(self, data, "time"),
		detailSepType: (self, data) => has(self, data, "type") && before(self, data, "type"),
		detailSepSize: (self, data) => has(self, data, "size") && before(self, data, "size"),
		detailSepMode: (self, data) => has(self, data, "mode") && before(self, data, "mode"),
		detailSep: () => SEP,
	}
}

export {
	KIND_LABELS,
	SEP,
	createBehaviors,
	detailBlocks,
	detailLine,
	entryKind,
	typeClass,
	typeColor,
}
