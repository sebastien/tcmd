import { describe, expect, test } from "bun:test"
import {
	createFrameBehaviors,
	INSPECTOR_INLINE_WIDTH,
	MODE_SLOTS,
	modeWord,
	PANE_GROW,
	paneColumnWidth,
	VERSION,
} from "../../src/js/tcmd/components/Frame.js"

const theme = {
	textHeadingFg: "title",
	textSecondaryFg: "dim",
	brandTinyFrom: "#7aa2f7",
	brandTinyTo: "#7dcfff",
	brandCmdFrom: "#ff9e64",
	brandCmdTo: "#ffc777",
}

// A fake instance whose renderer dimensions stand in for the viewport.
const selfAt = (width, height) => ({ ctx: { width, height } })

describe("components Frame", () => {
	test("the brand shimmers: Tiny along the blues, Cmd along brighter oranges", () => {
		const behaviors = createFrameBehaviors({ theme })
		// Each word reads back letter by letter, gradients at their endpoints
		// (behaviors name each letter capitalized: brandI, brandM, …).
		const word = (letters) =>
			letters.map((letter) => {
				const key = `brand${letter.toUpperCase()}`
				expect(behaviors[key]()).toBe(letter)
				return behaviors[`${key}Fg`]()
			})
		const tiny = word(["T", "i", "n", "y"])
		expect(tiny[0]).toBe(theme.brandTinyFrom)
		expect(tiny[3]).toBe(theme.brandTinyTo)
		expect(new Set(tiny).size).toBe(4)
		const cmd = word(["C", "m", "d"])
		expect(cmd[0]).toBe(theme.brandCmdFrom)
		expect(cmd[2]).toBe(theme.brandCmdTo)
		expect(new Set(cmd).size).toBe(3)
		// The host trail follows the brand in the heading colour.
		expect(behaviors.topBar(null, { appHost: "devbox" })).toBe(" - devbox ")
		expect(behaviors.topBarFg()).toBe("title")
		// Mono (no brand colours): every letter falls back to the default.
		const mono = createFrameBehaviors({ theme: { textHeadingFg: undefined } })
		for (const letter of ["T", "C"]) expect(mono[`brand${letter}Fg`]()).toBeUndefined()
	})

	test("the identity bar draws the mode word in its brand gradient", () => {
		const behaviors = createFrameBehaviors({ theme })
		const letters = (data) =>
			Array.from({ length: MODE_SLOTS }, (_, i) => behaviors[`modeL${i}`](null, data)).join("")
		const shines = (data) =>
			Array.from({ length: MODE_SLOTS }, (_, i) => behaviors[`modeFg${i}`](null, data))
		// Absent mode data means the commander workspace, drawn along the Cmd
		// oranges — endpoints included, like the brand words, and every letter
		// its own colour so the word reads as a gradient.
		const commander = shines({})
		expect(letters({})).toBe("commander")
		expect(commander[0]).toBe(theme.brandCmdFrom)
		expect(commander[MODE_SLOTS - 1]).toBe(theme.brandCmdTo)
		expect(new Set(commander).size).toBe(MODE_SLOTS)
		// Explorer shimmers along the Tiny blues; its shorter word leaves the
		// last slot empty, and an empty text node takes no column.
		const explorer = shines({ viewMode: "explorer" })
		expect(letters({ viewMode: "explorer" })).toBe("explorer")
		expect(explorer[0]).toBe(theme.brandTinyFrom)
		expect(explorer[7]).toBe(theme.brandTinyTo)
		expect(new Set(explorer.slice(0, 8)).size).toBe(8)
		expect(behaviors.modeL8(null, { viewMode: "explorer" })).toBe("")
		expect(behaviors.modeFg8(null, { viewMode: "explorer" })).toBeUndefined()
		expect(modeWord(undefined)).toBe("commander")
		expect(modeWord("explorer")).toBe("explorer")
		// The version trail carries its leading space, so it follows the word
		// directly.
		expect(behaviors.topBarStatus(null, {})).toBe(` · ${VERSION}`)
		expect(behaviors.topBarStatusFg()).toBe("dim")
	})

	test("pane columns follow the panes' own grow ratios", () => {
		// Explorer: the current column grows by PANE_GROW, so its mirrors are
		// narrower than an even split — the width bug that mangled the mirror
		// breadcrumbs. 90 / 2.35 = 38, 90 * 1.35 / 2.35 = 51.
		const explorer = { viewMode: "explorer", currentId: "left", showPreview: false }
		expect(paneColumnWidth(90, "parent", explorer)).toBe(Math.floor(90 / (1 + PANE_GROW)))
		expect(paneColumnWidth(90, "left", explorer)).toBe(Math.floor((90 * PANE_GROW) / (1 + PANE_GROW)))
		expect(paneColumnWidth(90, "right", explorer)).toBe(0) // hidden mirror
		// Flipping the current pane swaps which column is the wide one.
		expect(paneColumnWidth(90, "right", { ...explorer, currentId: "right" })).toBe(
			Math.floor((90 * PANE_GROW) / (1 + PANE_GROW)),
		)
		// The inline inspector adds an equal column: 120 / 3.35.
		const preview = { ...explorer, showPreview: true }
		expect(paneColumnWidth(120, "parent", preview)).toBe(Math.floor(120 / (2 + PANE_GROW)))
		expect(paneColumnWidth(120, "left", preview)).toBe(Math.floor((120 * PANE_GROW) / (2 + PANE_GROW)))
		expect(paneColumnWidth(120, "preview", preview)).toBe(Math.floor(120 / (2 + PANE_GROW)))
		// Commander tiles its two panes evenly; the parent column does not exist.
		const commander = { viewMode: "commander", currentId: "left", showPreview: false }
		expect(paneColumnWidth(80, "left", commander)).toBe(40)
		expect(paneColumnWidth(80, "right", commander)).toBe(40)
		expect(paneColumnWidth(80, "parent", commander)).toBe(0)
		// Unknown viewport, hidden pane, unknown id: all 0.
		expect(paneColumnWidth(0, "left", commander)).toBe(0)
		expect(paneColumnWidth(80, "preview", commander)).toBe(0)
		expect(paneColumnWidth(80, "nope", commander)).toBe(0)
	})

	test("the minimum-size gate fires below the breakpoint", () => {
		const behaviors = createFrameBehaviors({ theme })
		expect(behaviors.tooSmall(selfAt(50, 12), {})).toBe(true)
		expect(behaviors.tooSmall(selfAt(64, 16), {})).toBe(false)
		expect(behaviors.tooSmall(selfAt(100, 30), {})).toBe(false)
		expect(behaviors.minSizeHint(selfAt(50, 12), {})).toContain("need 64x16")
		// Unknown size: never gate (tests, web).
		expect(behaviors.tooSmall(selfAt(0, 0), {})).toBe(false)
	})

	test("the inline inspector yields to the viewer when narrow", () => {
		const behaviors = createFrameBehaviors({ theme })
		const on = { showPreview: true, viewerOpen: false }
		const wide = selfAt(INSPECTOR_INLINE_WIDTH, 30)
		const narrow = selfAt(INSPECTOR_INLINE_WIDTH - 1, 30)
		expect(behaviors.inspectorNarrow(wide, on)).toBe(false)
		expect(behaviors.showInspectorInline(wide, on)).toBe(true)
		expect(behaviors.inspectorNarrow(narrow, on)).toBe(true)
		expect(behaviors.showInspectorInline(narrow, on)).toBe(false)
		expect(behaviors.showViewer(narrow, { showPreview: false, viewerOpen: true })).toBe(true)
		// The viewer overlay is width-independent: Enter opens it on a file
		// that cannot be edited, however wide the terminal is.
		expect(behaviors.showViewer(wide, { showPreview: false, viewerOpen: true })).toBe(true)
	})

	test("maximizing the inspector takes the whole pane row", () => {
		const behaviors = createFrameBehaviors({ theme })
		const wide = selfAt(INSPECTOR_INLINE_WIDTH, 30)
		const full = { showPreview: true, viewerOpen: false, previewFull: true }
		expect(behaviors.showPreviewFull(wide, full)).toBe(true)
		// Every column yields to the maximized preview, inline inspector too.
		expect(behaviors.showLeftPane(wide, full)).toBe(false)
		expect(behaviors.showRightPane(wide, full)).toBe(false)
		expect(behaviors.showParentPane(wide, { ...full, viewMode: "explorer" })).toBe(false)
		expect(behaviors.showInspectorInline(wide, full)).toBe(false)
		// Clearing the flag brings the layout straight back.
		expect(behaviors.showPreviewFull(wide, {})).toBe(false)
		expect(behaviors.showLeftPane(wide, {})).toBe(true)
		expect(behaviors.showInspectorInline(wide, { showPreview: true })).toBe(true)
	})

	test("the command bar wraps and the listing windows around it", () => {
		const behaviors = createFrameBehaviors({ theme })
		const items = [
			{ id: "pane.enter", title: "Open", keys: "Enter" },
			{ id: "pane.up", title: "Parent", keys: "←" },
		]
		const data = { commandBarItems: items, active: "left", leftMarked: new Set(), rightMarked: new Set() }
		// Two entries share one row on a wide viewport.
		expect(behaviors.barHeight(selfAt(120, 30), data)).toBe(1)
		// A 20-column bar only holds "[Open ⏎] " (9 columns) per row.
		expect(behaviors.barHeight(selfAt(20, 30), data)).toBe(2)
		// A notice or error swaps the keys for a one-line status.
		expect(behaviors.barHeight(selfAt(20, 30), { ...data, notice: { kind: "tip", text: "hi" } })).toBe(1)
		// The listing windows around the chrome: seven fixed rows plus the
		// bar. 30 - 7 - 1 = 22 listing rows with a one-row bar.
		expect(behaviors.listViewport(selfAt(120, 30), { ...data, commandBarItems: [] })).toBe(22)
		// Unknown size: render everything to measure.
		expect(behaviors.listViewport(selfAt(0, 0), data)).toBe(0)
	})

	test("pane boxes tile with a full border each and a header rule", () => {
		const behaviors = createFrameBehaviors({ theme })
		// Each pane draws all four edges so its border colour tracks its own
		// focus; the middle therefore shows two adjacent rules.
		expect(behaviors.leftBorder()).toEqual(["top", "left", "bottom", "right"])
		expect(behaviors.rightBorder()).toEqual(["top", "left", "bottom", "right"])
		// A top-only border renders the header rule.
		expect(behaviors.headRule()).toEqual(["top"])
	})
})
