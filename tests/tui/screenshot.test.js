// Screenshot captures: the SVG and ANSI writers over plain span fixtures, plus
// the live frame invariant — stripping the ANSI escapes must reproduce the
// renderer's character frame.

import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import nodePath from "node:path"
import { captureFrame, frameToANSI, frameToSVG, nextFrame, writeScreenshot } from "../../src/js/tcmd/tui/screenshot.js"
import { makeSetup, settle } from "../helpers/tui-setup.js"

const BOLD = 1 << 0
const DIM = 1 << 1
const UNDERLINE = 1 << 3

// A span colour as OpenTUI reports it: an RGBA with 8-bit channels, alpha 0
// meaning "no colour".
function rgba(hex) {
	if (!hex) return { buffer: new Uint16Array([0, 0, 0, 0]) }
	const value = Number.parseInt(hex.slice(1), 16)
	return { buffer: new Uint16Array([(value >> 16) & 255, (value >> 8) & 255, value & 255, 255]) }
}

function span(text, { fg, bg, attributes = 0, width = 1 } = {}) {
	return { text, fg: rgba(fg), bg: rgba(bg), attributes, width }
}

function line(spans) {
	return { spans }
}

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "etc", isDir: true },
	],
	"/home": [
		{ name: "documents", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\nthird line\n", size: 26 },
		{ name: "tiny.txt", text: "tiny", size: 4 },
	],
	"/etc": [{ name: "hosts", text: "127.0.0.1 localhost\n", size: 19 }],
}

// Trailing whitespace is where the two outputs differ by design: the SVG keeps
// cell geometry, the ANSI file drops the padding the terminal never shows.
function trimRight(frame) {
	return frame
		.replace(/\n+$/, "")
		.split("\n")
		.map((text) => text.replace(/\s+$/, ""))
}

describe("screenshot writers", () => {
	test("SVG keeps a transparent background and writes runs at their columns", () => {
		const frame = {
			width: 6,
			height: 1,
			lines: [
				line([
					span("a&", { fg: "#ffffff", width: 2 }),
					span("<b>", { fg: "#5c8cff", bg: "#274a9e", attributes: BOLD, width: 3 }),
					span(" ", { fg: "#ffffff", width: 1 }),
				]),
			],
		}
		const svg = frameToSVG(frame)
		expect(svg.startsWith("<svg ")).toBe(true)
		expect(svg.endsWith("</svg>\n")).toBe(true)
		expect(svg).toContain('width="50.58" height="17"')
		// The only painted background is the styled run: no full-frame rect.
		expect(svg).toContain('<rect x="16.86" y="0" width="25.29" height="17" fill="#274a9e"/>')
		expect(svg.match(/<rect /g)).toHaveLength(1)
		// Two text runs left: the blank tail is dropped, not painted.
		expect(svg.match(/<text /g)).toHaveLength(2)
		expect(svg).toContain('fill="#ffffff">a&amp;</text>')
		expect(svg).toContain('font-weight="bold">')
		expect(svg).toContain("&lt;b&gt;</text>")
	})

	test("SVG falls back to currentColor and carries emphasis", () => {
		const frame = {
			width: 1,
			height: 1,
			lines: [line([span("x", { attributes: DIM | UNDERLINE })])],
		}
		const svg = frameToSVG(frame)
		expect(svg).toContain('fill="currentColor"')
		expect(svg).toContain('opacity="0.6"')
		expect(svg).toContain('text-decoration="underline"')
	})

	test("ANSI emits SGR runs and strips back to the plain text", () => {
		const frame = {
			width: 7,
			height: 1,
			lines: [
				line([
					span("hi", { fg: "#ff0000", width: 2 }),
					span(" x ", { bg: "#00ff00", width: 3 }),
				]),
			],
		}
		const ansi = frameToANSI(frame)
		expect(ansi).toBe("\x1b[0;38;2;255;0;0mhi\x1b[0;48;2;0;255;0m x \x1b[0m\n")
		expect(trimRight(ansi.replace(/\x1b\[[0-9;]*m/g, ""))).toEqual(["hi x"])
	})

	test("the ANSI capture reproduces the live character frame", async () => {
		const { setup } = await makeSetup(TREE, 90, 22, { viewMode: "commander" })
		try {
			await settle(setup)
			const frame = captureFrame(setup.renderer)
			expect(frame.width).toBe(90)
			expect(frame.height).toBe(22)
			const plain = trimRight(frameToANSI(frame).replace(/\x1b\[[0-9;]*m/g, ""))
			expect(plain).toEqual(trimRight(setup.captureCharFrame()))
		} finally {
			setup.renderer.destroy()
		}
	})

	test("nextFrame resolves on the next rendered frame", async () => {
		const { setup } = await makeSetup(TREE, 90, 22, { viewMode: "commander" })
		try {
			const order = []
			const pending = nextFrame(setup.renderer).then(() => order.push("frame"))
			order.push("requested")
			await setup.renderOnce()
			await pending
			expect(order).toEqual(["requested", "frame"])
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the SVG capture keeps the box drawing and the status bar", async () => {
		const { setup } = await makeSetup(TREE, 90, 22, { viewMode: "commander" })
		try {
			await settle(setup)
			const svg = frameToSVG(captureFrame(setup.renderer))
			expect(svg).toContain("┌")
			expect(svg).toContain(">Commands </text>")
			expect(svg).toContain('fill="#274a9e"')
		} finally {
			setup.renderer.destroy()
		}
	})

	test("writeScreenshot writes the pair after the next frame", async () => {
		const directory = await mkdtemp(nodePath.join(tmpdir(), "tcmd-shot-"))
		const { setup } = await makeSetup(TREE, 90, 22, { viewMode: "commander" })
		try {
			await settle(setup)
			// A nested directory that does not exist yet: the writer creates it.
			const svgPath = nodePath.join(directory, "nested", "shot.svg")
			const ansPath = nodePath.join(directory, "nested", "shot.ans")
			const writing = writeScreenshot({ renderer: setup.renderer, svgPath, ansPath })
			// The capture reads the frame painted after the request, so the
			// caller must keep rendering (the panel-close path in the app does).
			await setup.renderOnce()
			expect(await writing).toEqual({ svgPath, ansPath, width: 90, height: 22 })
			const svg = await readFile(svgPath, "utf8")
			const ansi = await readFile(ansPath, "utf8")
			expect(svg.startsWith("<svg ")).toBe(true)
			// SGR runs sit between the characters (the title is a gradient).
			expect(ansi.replace(/\x1b\[[0-9;]*m/g, "")).toContain("TinyCmd")
			expect(ansi).toContain("\x1b[")
		} finally {
			setup.renderer.destroy()
			await rm(directory, { recursive: true, force: true })
		}
	})

	test("writeScreenshot never overwrites either file and cleans up a failed pair", async () => {
		const directory = await mkdtemp("/tmp/opencode/tcmd-shot-collision-")
		const renderer = { currentRenderBuffer: { width: 1, height: 1, getSpanLines: () => [line([span("x")])] } }
		const svgPath = nodePath.join(directory, "shot.svg")
		const ansPath = nodePath.join(directory, "shot.ans")
		try {
			await writeFile(svgPath, "existing SVG")
			await expect(writeScreenshot({ renderer, svgPath, ansPath })).rejects.toMatchObject({ code: "EEXIST" })
			expect(await readFile(svgPath, "utf8")).toBe("existing SVG")
			expect(await Bun.file(ansPath).exists()).toBe(false)
			await rm(svgPath)
			await writeFile(ansPath, "existing ANSI")
			await expect(writeScreenshot({ renderer, svgPath, ansPath })).rejects.toMatchObject({ code: "EEXIST" })
			expect(await readFile(ansPath, "utf8")).toBe("existing ANSI")
			expect(await Bun.file(svgPath).exists()).toBe(false)
			await rm(ansPath)
			const results = await Promise.allSettled([
				writeScreenshot({ renderer, svgPath, ansPath }),
				writeScreenshot({ renderer, svgPath, ansPath }),
			])
			expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
			expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
			expect(await readFile(svgPath, "utf8")).toContain("<svg ")
			expect(await readFile(ansPath, "utf8")).toContain("x")
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})

	test("writeScreenshot fails when there is no renderer", async () => {
		await expect(writeScreenshot({ renderer: null })).rejects.toThrow("renderer is not available")
	})
})
