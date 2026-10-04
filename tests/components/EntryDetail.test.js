import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import {
	createBehaviors,
	detailLine,
	detailSegments,
	entryKind,
	metaLine,
	metaSegments,
	typeColor,
} from "../../src/js/tcmd/components/EntryDetail.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

const STAMP = new Date(2026, 9, 6, 7, 55).getTime()
const C_STAMP = new Date(2026, 9, 5, 21, 10).getTime()

describe("EntryDetail", () => {
	test("classifies entry kinds with symlink precedence", () => {
		expect(entryKind(null)).toBe("file")
		expect(entryKind({ isDir: true })).toBe("directory")
		expect(entryKind({ isSymlink: true, isDir: true })).toBe("symlink")
		expect(entryKind({ isDevice: true })).toBe("device")
		expect(entryKind({})).toBe("file")
	})

	test("detailLine shows mtime, type and size; dirs drop the size", () => {
		const file = { isDir: false, size: 26, mtimeMs: STAMP }
		expect(detailLine(file)).toBe("  2026-10-06 07:55 · file · 26B")
		expect(detailLine({ isDir: true, mtimeMs: STAMP })).toBe("  2026-10-06 07:55 · dir")
		expect(detailLine({ isSymlink: true, size: 0, mtimeMs: STAMP })).toBe("  2026-10-06 07:55 · link · 0B")
		expect(detailLine(null)).toBe("")
	})

	test("metaLine shows ctime, owner and mode; empty when the backend has none", () => {
		const rich = { ctimeMs: C_STAMP, owner: "tester:users", mode: 0o100644 }
		expect(metaLine(rich)).toBe("  2026-10-05 21:10 · tester:users · -rw-r--r--")
		expect(metaLine({})).toBe("")
		// Partial fields still read cleanly with a leading indent.
		expect(metaLine({ owner: "tester" })).toBe("  tester")
		expect(metaLine({ ctimeMs: C_STAMP, mode: 0o100644 })).toBe("  2026-10-05 21:10 · -rw-r--r--")
		// The optional ownerOf hook resolves a raw uid/gid.
		expect(metaLine({ owner: "", uid: 1000, gid: 1000 }, () => "tester")).toBe("  tester")
	})

	test("segments slice the line so empty slots take no width", () => {
		const detail = detailSegments({ isDir: false, size: 26, mtimeMs: STAMP })
		expect(detail.lead).toBe("  2026-10-06 07:55 · ")
		expect(detail.type).toBe("file")
		expect(detail.tail).toBe(" · 26B")
		// A directory has no size: the tail is empty (hidden).
		expect(detailSegments({ isDir: true, mtimeMs: STAMP }).tail).toBe("")

		const meta = metaSegments({ ctimeMs: C_STAMP, owner: "tester", mode: 0o100644 })
		expect(meta.lead).toBe("  2026-10-05 21:10 · ")
		expect(meta.owner).toBe("tester")
		expect(meta.sep).toBe(" · ")
		expect(meta.mode).toBe("-rw-r--r--")
		// Owner leads with its own indent when there is no ctime.
		const partial = metaSegments({ owner: "tester" })
		expect(partial.lead).toBe("")
		expect(partial.owner).toBe("  tester")
		expect(partial.sep).toBe("")
		expect(partial.mode).toBe("")
	})

	test("typeColor mirrors the listing colours", () => {
		expect(typeColor({ isDir: true }, behaviorEnv)).toBe(behaviorEnv.dirFg)
		expect(typeColor({ isSymlink: true }, behaviorEnv)).toBe(behaviorEnv.linkFg)
		expect(typeColor({ isDevice: true }, behaviorEnv)).toBe(behaviorEnv.devFg)
		expect(typeColor({}, behaviorEnv)).toBe(behaviorEnv.fileFg)
	})

	test("behaviors read the entry cell at use and colour the type/mode", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const entry = cell(null)
		const data = { entry }
		expect(behaviors.detailType(null, data)).toBe("")
		expect(behaviors.metaMode(null, data)).toBe("")
		expect(behaviors.dimFg()).toBe("dim")
		expect(behaviors.metaModeFg()).toBe("accent")

		entry.set({ isDir: false, size: 26, mtimeMs: STAMP, ctimeMs: C_STAMP, owner: "tester", mode: 0o100644 })
		expect(behaviors.detailType(null, data)).toBe("file")
		expect(behaviors.detailTypeFg(null, data)).toBe(behaviorEnv.fileFg)
		expect(behaviors.detailTypeClass(null, data)).toBe("is-file")
		expect(behaviors.detailHasLead(null, data)).toBe(true)
		expect(behaviors.detailHasTail(null, data)).toBe(true)
		expect(behaviors.metaMode(null, data)).toBe("-rw-r--r--")
		expect(behaviors.metaHasMode(null, data)).toBe(true)

		entry.set({ isDir: true, mtimeMs: STAMP, mode: 0o040755 })
		expect(behaviors.detailType(null, data)).toBe("dir")
		expect(behaviors.detailTypeFg(null, data)).toBe(behaviorEnv.dirFg)
		expect(behaviors.detailHasTail(null, data)).toBe(false)
		expect(behaviors.metaMode(null, data)).toBe("  drwxr-xr-x")
	})
})
