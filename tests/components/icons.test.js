// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tests/components/icons
// The Nerd Font icon mapping: kind icons first, then basename, then
// extension, then the generic file icon, plus the `TCMD_ICONS` opt-out.

import { describe, expect, test } from "bun:test"
import { DEVICE_ICON, DIR_ICON, FILE_ICON, SYMLINK_ICON, extensionOf, iconFor, iconsEnabled, lucideIconFor } from "../../src/js/tcmd/components/icons.js"

describe("icons", () => {
	test("kind icons win, symlinks over directories", () => {
		expect(iconFor({ name: "sub", isDir: true })).toBe(DIR_ICON)
		expect(iconFor({ name: "ln", isSymlink: true })).toBe(SYMLINK_ICON)
		expect(iconFor({ name: "ln", isSymlink: true, isDir: true })).toBe(SYMLINK_ICON)
		expect(iconFor({ name: "null", isDevice: true })).toBe(DEVICE_ICON)
		expect(iconFor(null)).toBe("")
	})

	test("extensions map to seti icons", () => {
		expect(iconFor({ name: "a.js" })).not.toBe(FILE_ICON)
		expect(iconFor({ name: "a.js" })).toBe(iconFor({ name: "b.MJS" }))
		expect(iconFor({ name: "main.rs" })).not.toBe(FILE_ICON)
		expect(iconFor({ name: "style.css" })).not.toBe(FILE_ICON)
		expect(iconFor({ name: "photo.png" })).not.toBe(FILE_ICON)
		// The last extension decides, so `archive.tar.gz` reads as an archive.
		expect(iconFor({ name: "archive.tar.gz" })).toBe(iconFor({ name: "b.zip" }))
	})

	test("basenames and dotfiles map by name", () => {
		expect(iconFor({ name: "Makefile" })).toBe(iconFor({ name: "makefile" }))
		expect(iconFor({ name: "Dockerfile" })).not.toBe(FILE_ICON)
		expect(iconFor({ name: ".gitignore" })).toBe(iconFor({ name: ".gitattributes" }))
	})

	test("unknown files fall back to the generic file icon", () => {
		expect(iconFor({ name: "noext" })).toBe(FILE_ICON)
		expect(iconFor({ name: "a.unknownext" })).toBe(FILE_ICON)
		// A dotfile without a known name has no extension.
		expect(iconFor({ name: ".bashrc" })).toBe(FILE_ICON)
	})

	test("web file kinds use semantic Lucide SVG icons", () => {
		expect(lucideIconFor({ name: "folder", isDir: true })).toBe("folder")
		expect(lucideIconFor({ name: "shortcut", isSymlink: true, isDir: true })).toBe("link-2")
		expect(lucideIconFor({ name: "null", isDevice: true })).toBe("cpu")
		expect(lucideIconFor({ name: "index.ts" })).toBe("file-code")
		expect(lucideIconFor({ name: "README.md" })).toBe("file-text")
		expect(lucideIconFor({ name: "photo.png" })).toBe("file-image")
		expect(lucideIconFor({ name: "song.mp3" })).toBe("audio-lines")
		expect(lucideIconFor({ name: "clip.mp4" })).toBe("video")
		expect(lucideIconFor({ name: "archive.tar.gz" })).toBe("file-archive")
		expect(lucideIconFor({ name: "store.sqlite" })).toBe("database")
		expect(lucideIconFor({ name: "unknown.bin" })).toBe("file")
	})

	test("extensionOf skips dotfiles and trailing dots", () => {
		expect(extensionOf("a.tar.gz")).toBe("gz")
		expect(extensionOf(".bashrc")).toBe("")
		expect(extensionOf("name.")).toBe("")
		expect(extensionOf(undefined)).toBe("")
	})

	test("icons are on unless TCMD_ICONS opts out", () => {
		expect(iconsEnabled({})).toBe(true)
		expect(iconsEnabled({ TCMD_ICONS: "1" })).toBe(true)
		expect(iconsEnabled({ TCMD_ICONS: "0" })).toBe(false)
		expect(iconsEnabled({ TCMD_ICONS: "false" })).toBe(false)
		expect(iconsEnabled({ TCMD_ICONS: "off" })).toBe(false)
	})
})

// EOF
