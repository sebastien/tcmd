import { describe, expect, test } from "bun:test"
import { formatCounts, formatDisk, formatMode, formatSize, formatTime, formatTitle } from "../../src/js/tcmd/components/format.js"

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

	test("formats timestamps and POSIX modes", () => {
		const stamp = new Date(2026, 9, 6, 7, 55).getTime()
		expect(formatTime(stamp)).toBe("2026-10-06 07:55")
		expect(formatTime(0)).toBe("")
		expect(formatMode(0o100644)).toBe("-rw-r--r--")
		expect(formatMode(0o040755)).toBe("drwxr-xr-x")
		expect(formatMode(0o120777)).toBe("lrwxrwxrwx")
		// setuid replaces the execute slot.
		expect(formatMode(0o104755)).toBe("-rwsr-xr-x")
		expect(formatMode(0)).toBe("")
	})

	test("formats the header title, compressing middle segments to fit", () => {
		expect(formatTitle("box", "/home/seb/app", 0)).toBe("TinyCmd - box /home/seb/app")
		expect(formatTitle("box", "/home/seb/app", 40)).toBe("TinyCmd - box /home/seb/app")
		// Collapse middle segments left to right, keeping the basename.
		expect(formatTitle("box", "/home/seb/app", 22)).toBe("TinyCmd - box /h/s/app")
		expect(formatTitle("box", "/home/sebastien/Workspace/Perso/tcmd", 31)).toBe(
			"TinyCmd - box /h/s/W/Perso/tcmd",
		)
		// No host, root path, and a width too small for anything but a stub.
		expect(formatTitle("", "/", 40)).toBe("TinyCmd - /")
		expect(formatTitle("box", "/home/seb/app", 12)).toBe("TinyCmd - b…")
	})
})
