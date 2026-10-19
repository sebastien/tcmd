import { describe, expect, test } from "bun:test"
import { gzipSync } from "node:zlib"
import { compressedBytes, decompressHead } from "../../src/js/tcmd/core/decompress.js"
import { PREVIEW_BYTES } from "../../src/js/tcmd/core/preview.js"

// "hello from bzip2\ncafé second line\n", compressed with `bzip2 -c`, so the
// tests do not need the system binary.
const BZIP2_FIXTURE = Uint8Array.from(
	Buffer.from(
		"QlpoOTFBWSZTWeweYXcAAAjZlAAQQAAQAD9n2BAAIAgAIAAijIMhoNqCgaaGRkxCtnSjmFVOQfdGr0TQ2g5DJiw8fxdyRThQkOweYXc=",
		"base64",
	),
)
const BZIP2_TEXT = "hello from bzip2\ncafé second line\n"

describe("decompress", () => {
	test("gunzips the head of a gzip stream", async () => {
		const bytes = gzipSync("hello gzip\ncafé\n")
		expect(await decompressHead(bytes, "gzip")).toBe("hello gzip\ncafé\n")
	})

	test("bunzips a bzip2 stream", async () => {
		expect(await decompressHead(BZIP2_FIXTURE, "bzip2")).toBe(BZIP2_TEXT)
	})

	test("stops at the output budget", async () => {
		const text = "0123456789".repeat(1000)
		expect(await decompressHead(gzipSync(text), "gzip", 7)).toBe("0123456")
		expect(await decompressHead(BZIP2_FIXTURE, "bzip2", 5)).toBe("hello")
	})

	test("a truncated gzip head still yields its opening bytes", async () => {
		const compressed = gzipSync("hello gzip\n")
		// Leave out the gzip trailer: the stream is cancelled at the budget.
		expect(await decompressHead(compressed.subarray(0, compressed.length - 4), "gzip", 10)).toBe(
			"hello gzip",
		)
	})

	test("rejects corrupt streams and unsupported formats", async () => {
		await expect(decompressHead(new Uint8Array([1, 2, 3]), "gzip")).rejects.toThrow()
		expect(() => decompressHead(BZIP2_FIXTURE, "lzma")).toThrow("unsupported compression")
	})

	test("bzip2 reads a whole block, gzip only a head", () => {
		expect(compressedBytes("gzip")).toBe(PREVIEW_BYTES)
		// Block size 9 tops out at 900 kB before compression.
		expect(compressedBytes("bzip2")).toBeGreaterThanOrEqual(900_000)
	})
})
