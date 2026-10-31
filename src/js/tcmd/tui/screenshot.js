// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-11-01

// Module: tcmd/tui/screenshot
// Captures the live terminal grid and writes it as an SVG image plus an ANSI
// text file: the pair a page embeds (`<img src="screenshot.svg">`) and a
// terminal or a review pastes (`cat screenshot.ans`).
//
// The grid comes from the renderer's current paint buffer
// (`renderer.currentRenderBuffer.getSpanLines()`) — the same cells the golden
// tests read — so a capture is the screen as drawn: no re-layout and no second
// renderer to drift from the first. OpenTUI reports spans as
// `{ text, fg, bg, attributes, width }` with one span per cell or style run;
// `styleRuns` merges them and the two writers only differ in how a run is
// serialized.
//
// The output deliberately carries no background: the SVG keeps transparent
// cells transparent, so it sits on whatever page it is dropped into. It also
// embeds no font, so it names a monospace stack and the reader's own font
// draws the text — Nerd-Font icons need a patched one, the rest of the
// workspace is plain monospace.

import { mkdir, open, unlink } from "node:fs/promises"
import nodePath from "node:path"

// Constant: CELL_WIDTH / CELL_HEIGHT / FONT_SIZE
// The grid metrics the SVG pins. 8.43px is the advance of the bundled M+1Code
// Nerd Font Mono at 14px (0.60205em, the usual monospace ratio), and the 17px
// row leaves a little leading so box-drawing glyphs join vertically. The
// baseline sits where the terminal grid centres its text.
const CELL_WIDTH = 8.43
const CELL_HEIGHT = 17
const FONT_SIZE = 14
const BASELINE = 13.5
const FONT_FAMILY =
	'"M+1Code Nerd Font Mono", "Liberation Mono", "DejaVu Sans Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'

// Constant: Attributes
// OpenTUI's `TextAttributes` bits (see `@opentui/core`): the low byte of a
// span's `attributes` is the style mask. Only the ones a capture can carry
// are named here; blink and hidden have no still-image equivalent.
const BOLD = 1 << 0
const DIM = 1 << 1
const ITALIC = 1 << 2
const UNDERLINE = 1 << 3
const STRIKETHROUGH = 1 << 7

// Constant: XML_ESCAPES / INVALID_XML
// Text runs are dropped into XML content, so the markup characters have to be
// escaped and control bytes the XML parser rejects are removed.
const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }
const INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g

// Function: round2
// Keeps the SVG's coordinates at two decimals, so a frame stays diffable.
function round2(value) {
	return Math.round(value * 100) / 100
}

// Function: escapeXML
// Escapes a run's text for SVG content and strips control bytes.
function escapeXML(text) {
	return `${text ?? ""}`
		.replace(/[&<>"']/g, (char) => XML_ESCAPES[char])
		.replace(INVALID_XML, "")
}

// Function: colorHex
// An RGBA span colour as `#rrggbb`, or null when the cell has no colour (the
// alpha channel is zero, which is how OpenTUI reports "terminal default").
function colorHex(color) {
	const values = color?.buffer
	if (!values || !values[3]) return null
	let hex = "#"
	for (let i = 0; i < 3; i++) {
		hex += Math.max(0, Math.min(255, values[i] ?? 0)).toString(16).padStart(2, "0")
	}
	return hex
}

// Function: rgbTriplet
// `#rrggbb` to the `r;g;b` payload of an ANSI SGR colour parameter.
function rgbTriplet(hex) {
	const value = Number.parseInt(`${hex}`.slice(1), 16)
	return `${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}`
}

// Function: styleRuns
// Merges a line's spans into style runs, truncating the blank tail every row
// carries (the grid is space-padded to its full width). A trailing cell is
// kept when it paints a background — cursor rows, marks and badges are
// rectangular, so their padding is part of the picture.
function styleRuns(line) {
	const spans = line?.spans ?? []
	let last = -1
	for (let index = 0; index < spans.length; index++) {
		const span = spans[index]
		if (`${span.text ?? ""}`.trim() !== "" || colorHex(span.bg)) last = index
	}
	const runs = []
	let column = 0
	for (let index = 0; index <= last; index++) {
		const span = spans[index]
		const text = `${span.text ?? ""}`
		const width = Number.isFinite(span.width) ? span.width : [...text].length
		const fg = colorHex(span.fg)
		const bg = colorHex(span.bg)
		const attributes = span.attributes | 0
		const previous = runs[runs.length - 1]
		if (previous && previous.fg === fg && previous.bg === bg && previous.attributes === attributes) {
			previous.text += text
			previous.width += width
		} else {
			runs.push({ column, fg, bg, attributes, text, width })
		}
		column += width
	}
	return runs
}

// Function: svgTextStyle
// The presentation attributes a run's `<text>` carries: the fill colour and
// whatever emphasis the span asked for. A colour-less run inherits the page's
// text colour (`currentColor`), which is what the mono theme wants.
function svgTextStyle(run) {
	let style = ` fill="${run.fg ?? "currentColor"}"`
	if (run.attributes & BOLD) style += ' font-weight="bold"'
	if (run.attributes & ITALIC) style += ' font-style="italic"'
	const decoration = []
	if (run.attributes & UNDERLINE) decoration.push("underline")
	if (run.attributes & STRIKETHROUGH) decoration.push("line-through")
	if (decoration.length) style += ` text-decoration="${decoration.join(" ")}"`
	if (run.attributes & DIM) style += ' opacity="0.6"'
	return style
}

// Function: frameToSVG
// Serializes a captured frame as a standalone SVG document. Each run paints
// its background rect (only when coloured) then its text; the transparent
// cells stay transparent.
function frameToSVG(frame) {
	const width = Math.max(0, frame?.width ?? 0)
	const height = Math.max(0, frame?.height ?? 0)
	const pixelWidth = round2(width * CELL_WIDTH)
	const pixelHeight = round2(height * CELL_HEIGHT)
	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${pixelWidth} ${pixelHeight}" font-family='${FONT_FAMILY}' font-size="${FONT_SIZE}" xml:space="preserve">`,
	]
	const lines = frame?.lines ?? []
	for (let row = 0; row < lines.length; row++) {
		const y = round2(row * CELL_HEIGHT)
		for (const run of styleRuns(lines[row])) {
			const x = round2(run.column * CELL_WIDTH)
			if (run.bg) {
				parts.push(
					`<rect x="${x}" y="${y}" width="${round2(run.width * CELL_WIDTH)}" height="${CELL_HEIGHT}" fill="${run.bg}"/>`,
				)
			}
			// A run that only carries its background is a filled block, not text.
			if (run.text.trim() === "") continue
			parts.push(`<text x="${x}" y="${round2(y + BASELINE)}"${svgTextStyle(run)}>${escapeXML(run.text)}</text>`)
		}
	}
	parts.push("</svg>")
	return `${parts.join("\n")}\n`
}

// Function: ansiStyle
// The SGR sequence that opens a run. Each run starts from a reset so a style
// never leaks across a run boundary.
function ansiStyle(run) {
	const codes = ["0"]
	if (run.fg) codes.push(`38;2;${rgbTriplet(run.fg)}`)
	if (run.bg) codes.push(`48;2;${rgbTriplet(run.bg)}`)
	if (run.attributes & BOLD) codes.push("1")
	if (run.attributes & DIM) codes.push("2")
	if (run.attributes & ITALIC) codes.push("3")
	if (run.attributes & UNDERLINE) codes.push("4")
	if (run.attributes & STRIKETHROUGH) codes.push("9")
	return `\x1b[${codes.join(";")}m`
}

// Function: frameToANSI
// Serializes a captured frame as ANSI text: one line per row, SGR runs inside
// it, and a reset before each newline so the terminal is left in its own
// colours. Stripping the escapes yields the renderer's character frame.
function frameToANSI(frame) {
	const lines = frame?.lines ?? []
	const rows = []
	for (const line of lines) {
		let text = ""
		for (const run of styleRuns(line)) text += `${ansiStyle(run)}${run.text}`
		rows.push(`${text}\x1b[0m`)
	}
	return `${rows.join("\n")}\n`
}

// Function: captureFrame
// The grid the renderer is currently showing, as plain data
// (`{ width, height, lines }`), so the writers never touch the renderer.
function captureFrame(renderer) {
	const buffer = renderer?.currentRenderBuffer
	if (!buffer) throw new Error("no rendered frame to capture")
	return { width: buffer.width, height: buffer.height, lines: buffer.getSpanLines() }
}

// Function: nextFrame
// Resolves on the next rendered frame. A capture is requested from inside the
// command panel, which only closes after the operation returns; waiting for
// the next frame reads the workspace as the user left it, without the panel.
// The timer is a guard for a renderer that goes idle before emitting again.
function nextFrame(renderer) {
	return new Promise((resolve) => {
		if (typeof renderer?.once !== "function") {
			resolve()
			return
		}
		let timer = null
		let settled = false
		const finish = () => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			renderer.off?.("frame", finish)
			resolve()
		}
		timer = setTimeout(finish, 250)
		timer?.unref?.()
		renderer.once("frame", finish)
	})
}

// Function: writeScreenshot
// Captures the next frame and writes the SVG and ANSI files. Returns the
// written paths and the grid size, for the operation to report.
async function writeScreenshot({ renderer, svgPath, ansPath }) {
	if (!renderer) throw new Error("the terminal renderer is not available")
	await nextFrame(renderer)
	const frame = captureFrame(renderer)
	const svg = frameToSVG(frame)
	const ansi = frameToANSI(frame)
	await mkdir(nodePath.dirname(svgPath), { recursive: true })
	// Reserve both names exclusively before writing: another session/process
	// may have created either file since core checked for a free pair.
	const svgFile = await open(svgPath, "wx")
	let ansFile
	try {
		ansFile = await open(ansPath, "wx")
		await svgFile.writeFile(svg)
		await ansFile.writeFile(ansi)
	} catch (error) {
		// Remove only files this capture created, never the colliding file.
		await Promise.all([
			unlink(svgPath).catch(() => {}),
			...(ansFile ? [unlink(ansPath).catch(() => {})] : []),
		])
		throw error
	} finally {
		await Promise.all([svgFile.close(), ansFile?.close()])
	}
	return { svgPath, ansPath, width: frame.width, height: frame.height }
}

export { captureFrame, frameToANSI, frameToSVG, nextFrame, writeScreenshot }

// EOF
