import { describe, expect, test } from "bun:test"
import { decodeBase64, encodeBase64 } from "../../src/js/tcmd/core/base64.js"

describe("base64", () => {
	test("encodes with padding", () => {
		expect(encodeBase64(new Uint8Array([]))).toBe("")
		expect(encodeBase64(new Uint8Array([0x66]))).toBe("Zg==")
		expect(encodeBase64(new Uint8Array([0x66, 0x6f]))).toBe("Zm8=")
		expect(encodeBase64(new Uint8Array([0x66, 0x6f, 0x6f]))).toBe("Zm9v")
	})

	test("round-trips arbitrary bytes", () => {
		const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
		expect([...decodeBase64(encodeBase64(bytes))]).toEqual([...bytes])
	})

	test("decoding ignores padding, whitespace and foreign characters", () => {
		expect([...decodeBase64("Zm9v\nYmFy")]).toEqual([...new TextEncoder().encode("foobar")])
		expect([...decodeBase64("!!Zg==")]).toEqual([0x66])
	})
})
