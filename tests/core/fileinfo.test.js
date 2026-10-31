import { describe, expect, test } from "bun:test"
import {
	countLines,
	describeBytes,
	detectFormat,
	formatMismatch,
} from "../../src/js/tcmd/core/fileinfo.js"

function bytes(values) {
	return Uint8Array.from(values)
}

function text(value) {
	return new TextEncoder().encode(value)
}

describe("fileinfo", () => {
	test("detects common formats from their magic bytes", () => {
		expect(detectFormat(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toMatchObject({
			label: "PNG image",
			mime: "image/png",
			kind: "image",
		})
		expect(detectFormat(bytes([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ label: "JPEG image" })
		expect(detectFormat(text("%PDF-1.7\n"))).toMatchObject({ label: "PDF document" })
		expect(detectFormat(bytes([0x1f, 0x8b, 0x08]))).toMatchObject({ label: "gzip compressed" })
		expect(detectFormat(text("PK\u0003\u0004"))).toMatchObject({ label: "ZIP archive" })
		expect(detectFormat(bytes([0x7f, 0x45, 0x4c, 0x46, 0x02]))).toMatchObject({ label: "ELF executable" })
		expect(detectFormat(text("hello\n"))).toBeNull()
		expect(detectFormat(new Uint8Array())).toBeNull()
	})

	test("describes text with its encoding, lines and size", () => {
		expect(describeBytes(text("hello\nworld\n"))).toMatchObject({
			kind: "text",
			label: "ASCII text",
			mime: "text/plain",
			encoding: "ASCII",
			binary: false,
			lines: 2,
		})
		expect(describeBytes(text("café\n"))).toMatchObject({
			label: "UTF-8 text",
			encoding: "UTF-8",
			lines: 1,
		})
		// A final line without a newline still counts.
		expect(countLines("a\nb")).toBe(2)
		expect(countLines("a\nb\n")).toBe(2)
		expect(countLines("")).toBe(0)
	})

	test("recognizes BOMs and scripts", () => {
		const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf, ...text("hi\n")])
		expect(describeBytes(utf8Bom)).toMatchObject({ encoding: "UTF-8 (BOM)", label: "UTF-8 (BOM) text" })
		const utf16 = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00])
		expect(describeBytes(utf16)).toMatchObject({ encoding: "UTF-16 LE (BOM)", label: "UTF-16 LE (BOM) text" })
		expect(describeBytes(text("#!/usr/bin/env node\nconsole.log(1)\n"))).toMatchObject({
			kind: "text",
			label: "script (/usr/bin/env node)",
			mime: "text/x-script",
		})
	})

	test("recognizes UTF-16 in both byte orders without a BOM", () => {
		for (const [encoding, body] of [
			["UTF-16 LE", [104, 0, 105, 0, 10, 0]],
			["UTF-16 BE", [0, 104, 0, 105, 0, 10]],
		]) {
			expect(describeBytes(bytes(body))).toMatchObject({
				kind: "text", encoding, binary: false, lines: 1,
			})
		}
		expect(describeBytes(bytes([0, 0, 0, 0]))).toMatchObject({ kind: "binary" })
	})

	test("reports an empty head and binary data", () => {
		expect(describeBytes(new Uint8Array())).toMatchObject({
			kind: "empty",
			label: "empty file",
			lines: 0,
		})
		expect(describeBytes(bytes([0x00, 0x01, 0x02, 0x03]))).toMatchObject({
			kind: "binary",
			label: "binary data",
			mime: "application/octet-stream",
			binary: true,
		})
	})

	test("a truncated UTF-8 head is still text", () => {
		const encoded = text("café\n")
		// Cut the final byte of the two-byte é sequence.
		const cut = encoded.subarray(0, encoded.length - 2)
		expect(describeBytes(cut, { partial: true })).toMatchObject({ kind: "text", label: "UTF-8 text" })
	})

	test("compares the content with the extension", () => {
		const png = describeBytes(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
		expect(formatMismatch(png, "png")).toBeNull()
		expect(formatMismatch(png, "txt")).toContain("does not match PNG image")
		const textInfo = describeBytes(text("hello\n"))
		expect(formatMismatch(textInfo, "txt")).toBeNull()
		expect(formatMismatch(textInfo, "png")).toContain("suggests a binary format")
		// Unknown extensions are not judged.
		expect(formatMismatch(textInfo, "weird")).toBeNull()
	})
})
