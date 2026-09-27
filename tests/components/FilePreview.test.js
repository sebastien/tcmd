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
		expect(behaviors.actions()).toBe("[O]pen [E]dit")
	})

	test("titles show a kind badge when there is no extension", () => {
		expect(previewTitle({ kind: "image", title: "a", size: 0 })).toBe("a  <IMAGE>")
		expect(previewTitle({ kind: "media", title: "clip.mp4", size: 0, ext: "mp4" })).toBe(
			"clip.mp4  <MP4>",
		)
		expect(previewTitle(null)).toBe("preview")
	})
})
