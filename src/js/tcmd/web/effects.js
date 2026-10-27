// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-13

// Module: tcmd/web/effects
// DOM effects owned by the mounted App: viewport measurement, modal focus,
// default-key trapping and keeping the keyboard cursor visible. select.js
// renders without any of this, so the web binding owns it explicitly.

import { effect } from "select/state/cells"

const canvases = new WeakMap()

function isToolbarTarget(target) {
	return Boolean(target?.closest?.(".desktop-toolbar"))
}

// Function: columnWidth
// Available monospace columns, or zero in a DOM without layout (happy-dom).
function columnWidth(el) {
	if (!el?.clientWidth) return 0
	const doc = el.ownerDocument
	const view = doc.defaultView
	let canvas = canvases.get(doc)
	if (!canvas) {
		canvas = doc.createElement("canvas")
		canvases.set(doc, canvas)
	}
	const ctx = canvas.getContext("2d")
	if (!ctx) return 0
	const style = view.getComputedStyle(el)
	ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
	const width = ctx.measureText("0").width
	const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
	return width ? Math.floor((el.clientWidth - padding) / width) : 0
}

// Function: keepVisible
// Scroll only the row's own list, never the page or an ancestor overlay.
function keepVisible(list, row) {
	if (!list?.clientHeight || !row) return
	const listRect = list.getBoundingClientRect()
	const rowRect = row.getBoundingClientRect()
	if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top
	else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom
}

// Function: previewBodies
// The scrollable preview bodies in `root`: the inspector, the maximized
// preview and the viewer each reuse one text/card body.
function previewBodies(root) {
	return root?.querySelectorAll?.(".preview-text, .preview-card") ?? []
}

// Function: resetPreviewScroll
// Send the preview body back to the top. The inspector, the maximized preview
// and the viewer each reuse one scrollable body, so a scroll offset would
// otherwise carry over to the next file.
function resetPreviewScroll(root) {
	for (const body of previewBodies(root)) {
		body.scrollTop = 0
	}
}

// Function: applyPreviewScroll
// Apply a full-preview scroll request from the App's arrow routing. The DOM
// clamps `scrollTop` against the visible body, so the edges need no guard.
function applyPreviewScroll(root, delta) {
	if (!delta) return
	for (const body of previewBodies(root)) {
		body.scrollTop = Math.max(0, body.scrollTop + delta)
	}
}

// Function: connectEffects
// Returns a frame scheduler and teardown; the App registers teardown with
// instance.effect(), so remounting leaves no listeners or observers behind.
function connectEffects(session, root, { size, help, viewer }) {
	// Select initially clones into an inert template document; the live window
	// is available before mount even though ownerDocument.defaultView is not.
	const view = root.ownerDocument.defaultView ?? globalThis.window
	const doc = view.document
	let frame = null
	let retries = 0
	let disposed = false
	// The viewer overlay is a modal at any width (Enter opens it on a file
	// that cannot be edited); it owns focus while open.
	const viewerOpen = () => Boolean(viewer.value)
	const modalOpen = () => Boolean(session.confirm.value || help.value || viewerOpen() || session.panelOpen.value || session.bookmarkOpen.value)
	const focusTarget = () => {
		if (session.confirm.value) return root.querySelector(".confirm")
		if (help.value) return root.querySelector(".help")
		if (viewerOpen()) return root.querySelector(".viewer")
		if (session.panelOpen.value) {
			if (session.pickerOpen.value) {
				return session.pickerFocus.value === "path"
					? root.querySelector(".panel-picker-path")
					: root.querySelector(".command-panel")
			}
			if (session.panelFocus.value === "ops") return root.querySelector(".panel-query")
			return root.querySelector(session.panelTextual.value ? ".panel-value" : ".command-panel")
		}
		if (session.bookmarkOpen.value) return root.querySelector(".bookmark-query")
		if (session.filtering.value) return root.querySelector(`.pane-${session.filtering.value} .filter-input`)
		return root
	}
	const update = () => {
		frame = null
		if (disposed || !root.isConnected) return
		const width = columnWidth(root)
		const lineHeight = Number.parseFloat(view.getComputedStyle(root).lineHeight)
		const height = lineHeight ? Math.floor(root.clientHeight / lineHeight) : 0
		if (width && height && (size.value.width !== width || size.value.height !== height)) size.set({ width, height })
		// A modal's field mounts on a later frame than the flag that opens it;
		// retry a few frames before giving up so focus lands on the overlay
		// instead of the root.
		const target = focusTarget()
		if (modalOpen() && !target && retries < 8) {
			retries += 1
			schedule()
			return
		}
		retries = 0
		// Do not steal focus as Tab moves between native toolbar buttons.
		const toolbarFocused = !modalOpen() && !session.filtering.value &&
			root.contains(doc.activeElement) && isToolbarTarget(doc.activeElement)
		const focusable = toolbarFocused ? doc.activeElement : target ?? root
		if (focusable !== doc.activeElement) focusable.focus({ preventScroll: true })
		for (const list of root.querySelectorAll(".file-list, .bookmark-rows, .panel-ops, .panel-args")) {
			keepVisible(list, list.querySelector(".is-current, .is-selected, .is-focused"))
		}
	}
	const schedule = () => {
		// Root renders queue child renders on the next frame. Wait past those
		// before focusing a newly mounted field or measuring a changed layout.
		if (!disposed && frame === null) frame = view.requestAnimationFrame(() => {
			frame = view.requestAnimationFrame(update)
		})
	}
	const trapKeys = (event) => {
		// Reload remains disabled even when native controls own the other keys.
		// F5 now refreshes the listing too, so it must not reload the page.
		if ((event.ctrlKey && event.key.toLowerCase() === "r") || event.key === "F5") {
			event.preventDefault()
			return
		}
		if (isToolbarTarget(event.target)) return
		const input = event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA"
		// Editing keeps native text/caret keys except the ones the shared
		// controller explicitly owns (vertical arrows, Enter and Tab).
		if (input && [" ", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return
		// The bookmark filter edits its query like any input; once it is empty,
		// Backspace removes the selected bookmark instead. Delete always does.
		const bookmarkFilterEmpty = session.bookmarkOpen.value && !`${session.bookmarkQuery?.value ?? ""}`.trim()
		if (input && event.key === "Backspace" && !bookmarkFilterEmpty) return
		if (session.bookmarkOpen.value && event.key === "Delete") event.preventDefault()
		if ([" ", "Backspace", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Escape"].includes(event.key)) event.preventDefault()
	}
	const focusIn = (event) => {
		if (modalOpen() && event.target !== focusTarget()) schedule()
	}
	root.addEventListener("keydown", trapKeys)
	doc.addEventListener("focusin", focusIn)
	root.addEventListener("focusout", schedule)
	view.addEventListener("resize", schedule)
	const observer = view.ResizeObserver ? new view.ResizeObserver(schedule) : null
	observer?.observe(root)
	// Pane proportions also change when the inspector is toggled.
	for (const pane of root.querySelectorAll(".pane")) observer?.observe(pane)
	// Modal state can change before the initial focus frame runs (for example,
	// the user opens the panel immediately after mount). Watch the focus-driving
	// cells directly so that initial layout work cannot swallow that handoff.
	const stopFocusWatch = effect(
		[
			session.panelOpen,
			session.panelFocus,
			session.panelOpIndex,
			session.panelRowIndex,
			session.panelTextual,
			session.pickerOpen,
			session.bookmarkOpen,
			session.filtering,
			session.confirm,
			session.overlay,
			help,
			viewer,
		],
		schedule,
	)
	// The preview target and its payload both change as the cursor moves:
	// reset on either so a new file starts at the top even when its text
	// arrives asynchronously.
	const previewInputs = [session.previewEntry, session.preview].filter((value) => value?.isReactive)
	const stopPreviewWatch = previewInputs.length
		? effect(previewInputs, () => resetPreviewScroll(root))
		: null
	// Full-preview arrow scrolling: the shared controller publishes a delta,
	// the DOM body applies it to its own measured viewport.
	const stopScrollWatch = session.previewScroll?.isReactive
		? effect([session.previewScroll], ([request]) => applyPreviewScroll(root, request?.delta ?? 0))
		: null
	schedule()
	return {
		schedule,
		dispose() {
			disposed = true
			stopFocusWatch?.()
			stopPreviewWatch?.()
			stopScrollWatch?.()
			if (frame !== null) view.cancelAnimationFrame(frame)
			observer?.disconnect()
			root.removeEventListener("keydown", trapKeys)
			root.removeEventListener("focusout", schedule)
			doc.removeEventListener("focusin", focusIn)
			view.removeEventListener("resize", schedule)
		},
	}
}

export { applyPreviewScroll, columnWidth, connectEffects, isToolbarTarget, keepVisible, resetPreviewScroll }

// EOF
