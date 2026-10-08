import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import {
	createBehaviors,
	detailBlocks,
	detailLine,
	entryKind,
	typeColor,
} from "../../src/js/tcmd/components/EntryDetail.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

const STAMP = new Date(2026, 9, 6, 7, 55).getTime()

describe("EntryDetail", () => {
	test("classifies entry kinds with symlink precedence", () => {
		expect(entryKind(null)).toBe("file")
		expect(entryKind({ isDir: true })).toBe("directory")
		expect(entryKind({ isSymlink: true, isDir: true })).toBe("symlink")
		expect(entryKind({ isDevice: true })).toBe("device")
		expect(entryKind({})).toBe("file")
	})

	test("blocks are date · type · size · rights, dirs drop the size", () => {
		const file = { isDir: false, size: 26, mtimeMs: STAMP, mode: 0o100644 }
		expect(detailBlocks(file).map((block) => block.key)).toEqual(["time", "type", "size", "mode"])
		expect(detailBlocks({ isDir: true, mtimeMs: STAMP, mode: 0o040755 }).map((b) => b.key)).toEqual([
			"time",
			"type",
			"mode",
		])
		// No mtime and no mode: only the type survives.
		expect(detailBlocks({ isDir: false, size: 4 }).map((b) => b.key)).toEqual(["type", "size"])
		expect(detailBlocks(null)).toEqual([])
	})

	test("detailLine joins the fields with a middle dot", () => {
		const file = { isDir: false, size: 26, mtimeMs: STAMP, mode: 0o100644 }
		expect(detailLine(file)).toBe("  2026-10-06 07:55 · file · 26B · -rw-r--r--")
		expect(detailLine({ isDir: true, mtimeMs: STAMP, mode: 0o040755 })).toBe(
			"  2026-10-06 07:55 · dir · drwxr-xr-x",
		)
		expect(detailLine(null)).toBe("")
	})

	test("typeColor mirrors the listing colours", () => {
		expect(typeColor({ isDir: true }, behaviorEnv)).toBe(behaviorEnv.dirFg)
		expect(typeColor({ isSymlink: true }, behaviorEnv)).toBe(behaviorEnv.linkFg)
		expect(typeColor({ isDevice: true }, behaviorEnv)).toBe(behaviorEnv.devFg)
		expect(typeColor({}, behaviorEnv)).toBe(behaviorEnv.fileFg)
	})

	test("behaviors gate each block and colour the numeric fields bright", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const entry = cell(null)
		const data = { entry }
		expect(behaviors.detailHasIndent(null, data)).toBe(false)
		expect(behaviors.detailHasTime(null, data)).toBe(false)

		entry.set({ isDir: false, size: 26, mtimeMs: STAMP, mode: 0o100644 })
		expect(behaviors.detailHasIndent(null, data)).toBe(true)
		expect(behaviors.detailHasTime(null, data)).toBe(true)
		expect(behaviors.detailTime(null, data)).toBe("2026-10-06 07:55")
		expect(behaviors.detailHasType(null, data)).toBe(true)
		expect(behaviors.detailType(null, data)).toBe("file")
		expect(behaviors.detailTypeFg(null, data)).toBe(behaviorEnv.fileFg)
		expect(behaviors.detailTypeClass(null, data)).toBe("is-file")
		expect(behaviors.detailHasSize(null, data)).toBe(true)
		expect(behaviors.detailSize(null, data)).toBe("26B")
		expect(behaviors.detailHasMode(null, data)).toBe(true)
		expect(behaviors.detailMode(null, data)).toBe("-rw-r--r--")
		// The numeric fields share the bright token; the rights are accented.
		expect(behaviors.brightFg()).toBe(behaviorEnv.textFg)
		expect(behaviors.detailModeFg()).toBe(behaviorEnv.accentFg)
		// Separators only appear between the blocks that are present.
		expect(behaviors.detailSepType(null, data)).toBe(true)
		expect(behaviors.detailSepSize(null, data)).toBe(true)
		expect(behaviors.detailSepMode(null, data)).toBe(true)
		expect(behaviors.detailSep()).toBe(" · ")
	})

	test("a dir has no size block, so the size separator is hidden", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const data = { entry: { isDir: true, mtimeMs: STAMP, mode: 0o040755 } }
		expect(behaviors.detailHasSize(null, data)).toBe(false)
		expect(behaviors.detailSepSize(null, data)).toBe(false)
		expect(behaviors.detailSepMode(null, data)).toBe(true)
		expect(behaviors.detailMode(null, data)).toBe("drwxr-xr-x")
	})

	test("permissions are reserved on the right and kept last in order", () => {
		const file = { isDir: false, size: 26, mtimeMs: STAMP, mode: 0o100644 }
		const keys = detailBlocks(file).map((block) => block.key)
		// The rights are the last block; the presentation right-aligns it.
		expect(keys[keys.length - 1]).toBe("mode")
	})

	test("narrow panes drop the size, then the rights, keeping date and type", () => {
		const measure = (text) => text.length
		const elide = (text, width) => `${text.slice(0, Math.max(0, width - 1))}…`
		const at = (width) => createBehaviors({ ...behaviorEnv, width: () => width, measure, elide })
		const data = { entry: { isDir: false, size: 26, mtimeMs: STAMP, mode: 0o100644 } }

		// Roomy: the size and the right-aligned rights both fit.
		expect(at(46).detailHasSize(null, data)).toBe(true)
		expect(at(46).detailHasMode(null, data)).toBe(true)
		// One step tighter: the size goes, the rights stay.
		expect(at(40).detailHasSize(null, data)).toBe(false)
		expect(at(40).detailHasMode(null, data)).toBe(true)
		// Tighter still: the rights go too, leaving the date and type.
		expect(at(30).detailHasMode(null, data)).toBe(false)
		expect(at(30).detailHasType(null, data)).toBe(true)
		expect(at(30).detailHasTime(null, data)).toBe(true)
	})

	test("the last block elides when even the date and type overflow", () => {
		const measure = (text) => text.length
		const elide = (text, width) => `${text.slice(0, Math.max(0, width - 1))}…`
		const behaviors = createBehaviors({ ...behaviorEnv, width: () => 12, measure, elide })
		const data = { entry: { isDir: false, size: 26, mtimeMs: STAMP, mode: 0o100644 } }
		expect(behaviors.detailHasSize(null, data)).toBe(false)
		expect(behaviors.detailType(null, data)).toContain("…")
	})
})
