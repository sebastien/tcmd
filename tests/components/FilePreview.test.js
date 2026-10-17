import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { cardText, createBehaviors, hasCard, hasText, previewTitle } from "../../src/js/tcmd/components/FilePreview.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("FilePreview", () => {
	test("text, card and visibility helpers", () => {
		const textPreview = { kind: "text", title: "a.txt", size: 10, text: "hi" }
		const cardPreview = { kind: "image", title: "a.png", size: 0, text: null }
		expect(hasText(textPreview)).toBe(true)
		expect(hasText(cardPreview)).toBe(false)
		expect(hasCard(cardPreview)).toBe(true)
		expect(hasCard(textPreview)).toBe(false)
		expect(cardText(cardPreview)).toContain("image: a.png")
	})

	test("behaviors read the preview cell at use", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const preview = cell(null)
		const data = { preview, show: cell(true) }
		expect(behaviors.previewTitle(null, data)).toBe("preview")
		expect(behaviors.hasText(null, data)).toBe(false)
		expect(behaviors.show(null, data)).toBe(true)

		preview.set({ kind: "text", title: "a.txt", size: 10, text: "hi", ext: "txt" })
		expect(behaviors.previewText(null, data)).toBe("hi")
		expect(behaviors.previewTitle(null, data)).toBe("a.txt  <TXT>")
		expect(behaviors.hasText(null, data)).toBe(true)
		expect(behaviors.textFg()).toBe("text")
		expect(behaviors.dimFg()).toBe("dim")
		expect(behaviors.previewTitleColor()).toBe("title")
		expect(behaviors.actions()).toBe(" [Open O] [Edit E]")
	})

	test("titles show a kind badge when there is no extension", () => {
		expect(previewTitle({ kind: "image", title: "a", size: 0 })).toBe("a  <IMAGE>")
		expect(previewTitle({ kind: "media", title: "clip.mp4", size: 0, ext: "mp4" })).toBe(
			"clip.mp4  <MP4>",
		)
		expect(previewTitle(null)).toBe("preview")
	})

	test("inspector shows a directory column, a card, an empty state and a header", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const dir = { name: "docs", path: "/docs", isDir: true, size: 0 }
		// Directory under the cursor, no `stat` card: the directory column
		// takes the body instead of the metadata card.
		expect(behaviors.isDirPane(null, { preview: null, entry: dir })).toBe(true)
		expect(behaviors.showEntryCard(null, { preview: null, entry: dir })).toBe(false)
		expect(behaviors.entryText(null, { preview: null, entry: dir })).toContain("directory: docs/")
		expect(behaviors.headerTitle(null, { preview: null, entry: dir })).toBe("docs/  <DIR>")
		// A non-previewable file also gets a card, not a blank inspector.
		const bin = { name: "app.bin", path: "/app.bin", isDir: false, size: 4096, ext: "bin" }
		expect(behaviors.isDirPane(null, { preview: null, entry: bin })).toBe(false)
		expect(behaviors.showEntryCard(null, { preview: null, entry: bin })).toBe(true)
		expect(behaviors.entryText(null, { preview: null, entry: bin })).toContain("file: app.bin")
		// Nothing at all: the designed empty state.
		expect(behaviors.isEmpty(null, { preview: null, entry: null })).toBe(true)
		expect(behaviors.headerTitle(null, { preview: null, entry: null })).toBe("inspector")
		// A real preview wins over the entry — including on a directory, whose
		// `stat` card keeps the body.
		const preview = { kind: "text", title: "a.txt", size: 10, text: "hi", ext: "txt" }
		expect(behaviors.headerTitle(null, { preview, entry: dir })).toBe("a.txt  <TXT>")
		expect(behaviors.showEntryCard(null, { preview, entry: dir })).toBe(false)
		expect(behaviors.isDirPane(null, { preview: { kind: "directory", title: "docs", text: null }, entry: dir })).toBe(false)
	})

	test("the header names the symlink's traversal and its target's kind", () => {
		const behaviors = createBehaviors(behaviorEnv)
		// Before the async read lands, the header already says where the link
		// goes — and badges the *target's* extension, not the link's name.
		const fileLink = { name: "ln", path: "/ln", isDir: false, isSymlink: true, target: "real.txt", ext: "dat" }
		expect(behaviors.headerTitle(null, { preview: null, entry: fileLink })).toBe("ln -> real.txt  <TXT>")
		const dirLink = { name: "ln", path: "/ln", isDir: true, isSymlink: true, target: "real-dir", ext: null }
		expect(behaviors.headerTitle(null, { preview: null, entry: dirLink })).toBe("ln/ -> real-dir  <DIR>")
		// Once the preview lands its own title carries the traversal.
		expect(
			behaviors.headerTitle(null, {
				preview: { kind: "text", title: "ln -> real.txt", text: "hi", ext: "txt" },
				entry: null,
			}),
		).toBe("ln -> real.txt  <TXT>")
	})

	test("an image preview draws a decodable file and keeps the card otherwise", () => {
		const behaviors = createBehaviors({ ...behaviorEnv, imageExts: ["png", "jpg"] })
		const entry = { name: "a.png", path: "/a.png", isDir: false, size: 12, ext: "png" }
		const image = { kind: "image", title: "a.png", size: 12, text: null, ext: "png" }
		const data = { preview: image, entry }
		expect(behaviors.showImage(null, data)).toBe(true)
		expect(behaviors.showTextOrCard(null, data)).toBe(false)
		expect(behaviors.previewImageSource(null, data)).toBe("/a.png")
		// No path to load (a bare card, e.g. `stat`): the scrollbox keeps the
		// card so the inspector is never blank.
		const noPath = { preview: image, entry: { ...entry, path: undefined } }
		expect(behaviors.showImage(null, noPath)).toBe(false)
		expect(behaviors.showTextOrCard(null, noPath)).toBe(true)
		// A format the renderer cannot decode keeps the metadata card.
		const svg = { kind: "image", title: "a.svg", size: 12, text: null, ext: "svg" }
		expect(behaviors.showImage(null, { preview: svg, entry: { ...entry, name: "a.svg", path: "/a.svg", ext: "svg" } })).toBe(false)
		// A `stat` card pinned on an image wins over the image body.
		const pinned = { ...image, details: ["mode: -rw-r--r--"] }
		expect(behaviors.showImage(null, { preview: pinned, entry })).toBe(false)
		// The web env has no image renderable at all.
		expect(createBehaviors(behaviorEnv).showImage(null, data)).toBe(false)
	})

	test("a text preview asks the renderer for its filetype", () => {
		const behaviors = createBehaviors({
			...behaviorEnv,
			filetype: (path) => (path.endsWith(".ts") ? "typescript" : undefined),
		})
		const text = { kind: "text", title: "a.ts", size: 4, text: "const x = 1", ext: "ts" }
		expect(behaviors.showText(null, { preview: text, entry: { path: "/a.ts" } })).toBe(true)
		expect(behaviors.codeFiletype(null, { preview: text, entry: { path: "/a.ts" } })).toBe("typescript")
		// No bundled parser: the code renderable draws plain text.
		expect(behaviors.codeFiletype(null, { preview: text, entry: { path: "/a.txt" } })).toBeUndefined()
		// The web env carries no highlighter at all.
		expect(createBehaviors(behaviorEnv).codeFiletype(null, { preview: text, entry: { path: "/a.ts" } })).toBeUndefined()
	})
})
