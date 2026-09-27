import { describe, expect, test } from "bun:test"
import { formatCounts, formatDisk, formatSize } from "../../src/js/tcmd/components/format.js"

describe("format", () => {
	test("formats sizes, disk and counts", () => {
		expect(formatSize(0)).toBe("0B")
		expect(formatSize(2048)).toBe("2.0K")
		expect(formatDisk({ free: 1024, total: 2048 })).toBe("1.0K free of 2.0K")
		expect(
			formatCounts([
				{ isDir: true, size: 0 },
				{ isDir: false, size: 10 },
			]),
		).toBe("1 dirs, 1 files, 10B")
	})
})
