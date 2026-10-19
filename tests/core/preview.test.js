import { describe, expect, test } from "bun:test"
import {
	compressionOf,
	hasBinaryByte,
	previewKind,
	previewSource,
} from "../../src/js/tcmd/core/preview.js"

describe("preview", () => {
	test("classifies images, media and everything else as text", () => {
		expect(previewKind("png")).toBe("image")
		expect(previewKind("mp4")).toBe("media")
		expect(previewKind("txt")).toBe("text")
		expect(previewKind(null)).toBe("text")
	})

	test("maps compression extensions to their decompressor", () => {
		expect(compressionOf("gz")).toBe("gzip")
		expect(compressionOf("bz2")).toBe("bzip2")
		expect(compressionOf("txt")).toBeNull()
		expect(compressionOf(null)).toBeNull()
	})

	test("a plain entry passes through unchanged", () => {
		const source = previewSource({ name: "notes.txt", path: "/notes.txt", ext: "txt" })
		expect(source).toEqual({
			title: "notes.txt",
			ext: "txt",
			innerName: "notes.txt",
			innerExt: "txt",
			compression: null,
		})
	})

	test("a compressed entry classifies by the name inside", () => {
		const gzip = previewSource({ name: "notes.txt.gz", path: "/notes.txt.gz", ext: "gz" })
		expect(gzip).toMatchObject({
			title: "notes.txt.gz",
			ext: "gz",
			innerName: "notes.txt",
			innerExt: "txt",
			compression: "gzip",
		})
		const bzip2 = previewSource({ name: "sync.log.BZ2", path: "/sync.log.BZ2", ext: "bz2" })
		expect(bzip2).toMatchObject({ innerName: "sync.log", innerExt: "log", compression: "bzip2" })
		// No inner extension: the kind falls back to text, the output is sniffed.
		const bare = previewSource({ name: "backup.gz", path: "/backup.gz", ext: "gz" })
		expect(bare).toMatchObject({ innerName: "backup", innerExt: null, compression: "gzip" })
	})

	test("a symlink previews through its target, compression included", () => {
		const link = previewSource({
			name: "logs",
			path: "/logs",
			isSymlink: true,
			target: "../var/sync.log.gz",
			ext: null,
		})
		expect(link).toMatchObject({
			title: "logs -> ../var/sync.log.gz",
			ext: "gz",
			innerName: "sync.log",
			innerExt: "log",
			compression: "gzip",
		})
	})

	test("hasBinaryByte sniffs the opening control bytes", () => {
		expect(hasBinaryByte("hello\nworld\n")).toBe(false)
		expect(hasBinaryByte("\x00\x01\x02")).toBe(true)
	})
})
