// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-13

// Module: tcmd/web/effects
// DOM effects owned by the mounted App: viewport measurement, modal focus,
// default-key trapping and keeping the keyboard cursor visible. select.js
// renders without any of this, so the web binding owns it explicitly.

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
			if (session.panelPicking.value) return root.querySelector(".panel-picker-query")
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
		if (event.ctrlKey && event.key.toLowerCase() === "r") {
			event.preventDefault()
			return
		}
		if (isToolbarTarget(event.target)) return
		const input = event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA"
		// Editing keeps native text/caret keys except the ones the shared
		// controller explicitly owns (vertical arrows, Enter and Tab).
		if (input && [" ", "Backspace", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return
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
	schedule()
	return {
		schedule,
		dispose() {
			disposed = true
			if (frame !== null) view.cancelAnimationFrame(frame)
			observer?.disconnect()
			root.removeEventListener("keydown", trapKeys)
			root.removeEventListener("focusout", schedule)
			doc.removeEventListener("focusin", focusIn)
			view.removeEventListener("resize", schedule)
		},
	}
}

export { columnWidth, connectEffects, isToolbarTarget, keepVisible }

// EOF
