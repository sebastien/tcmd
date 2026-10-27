// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-31

// Module: tcmd/core/watch
// Change notification for a directory listing. A `Directory` watches the
// displayed path so listings written by other programs appear without a
// manual reload. The adapter's native `watch(path, onChange)` is preferred —
// the Node/Bun adapter maps it to `fs.watch`, so events are immediate. An
// adapter without it (OPFS, the HTTP API, the desktop RPC bridge) falls back
// to polling and comparing a listing signature, so the behaviour is the same
// with a few seconds of latency.
//
// Watchers are intentionally owned by the directory rather than the views:
// every pane has one, and a path change re-arms it (see `core/directory`).

// Constant: DEFAULT_DELAY
// Debounce for native events, which arrive in bursts (a copy emits a change
// per entry) and would otherwise trigger one read per event.
const DEFAULT_DELAY = 180

// Constant: DEFAULT_INTERVAL
// Polling cadence for adapters without a native watcher. Long enough not to
// hammer a remote API, short enough that changes feel automatic.
const DEFAULT_INTERVAL = 3000

// Function: listingSignature
// A cheap order-independent fingerprint of a listing: names, sizes, mtimes
// and modes. Polling compares it to decide whether the directory really
// changed, so an unchanged listing never publishes a new entries array.
function listingSignature(entries) {
	return (entries ?? [])
		.map(
			(entry) =>
				`${entry?.name ?? ""}\u0000${entry?.size ?? 0}\u0000${entry?.mtimeMs ?? 0}\u0000${entry?.mode ?? 0}`,
		)
		.sort()
		.join("\u0001")
}

// Function: createPathWatcher
// Watches `path` through the adapter's `watch` when it has one, or by polling
// `readDir`. Calls `onChange` when the listing may have changed. Returns a
// `stop()` that closes the native watcher or clears the poll timer; safe to
// call more than once.
//
// `watch` may return its stop synchronously (Node's adapter) or asynchronously
// (the desktop adapter, whose watch lives behind an RPC round-trip). Only a
// failed or unavailable native watch starts polling, so a resolved watch never
// pays for both.
//
// Options:
// - `delay`: native-event debounce in milliseconds (default 180).
// - `interval`: fallback polling period in milliseconds (default 3000).
//
// Example:
// ```javascript
// const stop = createPathWatcher(fs, "/home", () => dir.refresh())
// ```
function createPathWatcher(fs, path, onChange, options = {}) {
	const delay = options.delay ?? DEFAULT_DELAY
	const interval = options.interval ?? DEFAULT_INTERVAL
	let stopped = false
	let debounceTimer = null
	let pollTimer = null
	let stopNative = null

	const notify = () => {
		if (stopped) return
		onChange?.()
	}

	const startPolling = () => {
		if (stopped || pollTimer || typeof fs?.readDir !== "function") return
		let previous = null
		const poll = async () => {
			if (stopped) return
			let signature
			try {
				signature = listingSignature(await fs.readDir(path))
			} catch (error) {
				// A vanishing directory is a change too: the next read reports
				// it to the user instead of leaving a stale listing forever.
				signature = `error:${error?.code ?? error?.message ?? error}`
			}
			if (stopped) return
			if (previous !== null && signature !== previous) notify()
			previous = signature
			pollTimer = setTimeout(() => void poll(), interval)
			pollTimer?.unref?.()
		}
		pollTimer = setTimeout(() => void poll(), interval)
		pollTimer?.unref?.()
	}

	const useNativeWatch = (watched) => {
		if (stopped) {
			watched?.()
			return
		}
		if (typeof watched === "function") {
			stopNative = watched
			return
		}
		startPolling()
	}

	if (typeof fs?.watch === "function") {
		let watching = null
		try {
			watching = fs.watch(path, () => {
				if (stopped) return
				if (debounceTimer) clearTimeout(debounceTimer)
				debounceTimer = setTimeout(() => {
					debounceTimer = null
					notify()
				}, delay)
				debounceTimer?.unref?.()
			})
		} catch (error) {
			watching = null
		}
		// An async adapter (the desktop RPC bridge) resolves to its stop; a
		// null/undefined or rejected result means polling takes over.
		if (typeof watching?.then === "function") {
			watching.then(useNativeWatch, () => startPolling())
		} else {
			useNativeWatch(watching)
		}
	} else {
		startPolling()
	}

	return () => {
		if (stopped) return
		stopped = true
		if (debounceTimer) {
			clearTimeout(debounceTimer)
			debounceTimer = null
		}
		if (pollTimer) {
			clearTimeout(pollTimer)
			pollTimer = null
		}
		stopNative?.()
		stopNative = null
	}
}

export { createPathWatcher, DEFAULT_DELAY, DEFAULT_INTERVAL, listingSignature }

// EOF
