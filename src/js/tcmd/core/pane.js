// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/pane
// A Pane is a column of tabs. The pane owns the tab list, the shared marks map
// and the label allocator; its cells proxy the active tab, so views and
// commands address a pane as if it had a single directory while tabs can be
// added, closed and switched underneath. Navigation is async and updates the
// active tab's `rawEntries` in place.

import { cell, derived, switched } from "select/state/cells"
import { createLabels, createTab } from "./tab.js"

// Function: createPane
// Creates a pane bound to a filesystem adapter, starting with one tab at
// `path`.
//
// Example:
// ```javascript
// const pane = createPane({ fs: createNodeFs(), path: "/home" })
// await pane.refresh()
// pane.entries.value // active tab's sorted, filtered FileEntry[]
// await pane.addTab("/tmp") // second tab, labelled by the pane allocator
// ```
function createPane({ fs, path: initialPath, labels } = {}) {
	const pane = {}
	pane.fs = fs
	pane.labels = labels ?? createLabels()
	pane.marks = cell({})
	pane.tabs = cell([])
	pane.activeIndex = cell(0)
	pane.activeTab = derived([pane.tabs, pane.activeIndex], ([tabs, index]) =>
		tabs.length ? tabs[Math.max(0, Math.min(index, tabs.length - 1))] : null,
	)

	// Proxy cells mirror the active tab: reads follow tab switches, writes are
	// forwarded to the active tab.
	pane.path = switched(pane.activeTab, (tab) => tab?.path)
	pane.rawEntries = switched(pane.activeTab, (tab) => tab?.rawEntries)
	pane.loading = switched(pane.activeTab, (tab) => tab?.loading)
	pane.error = switched(pane.activeTab, (tab) => tab?.error)
	pane.filter = switched(pane.activeTab, (tab) => tab?.filter)
	pane.sort = switched(pane.activeTab, (tab) => tab?.sort)
	pane.entries = switched(pane.activeTab, (tab) => tab?.entries)
	pane.cursor = switched(pane.activeTab, (tab) => tab?.cursor)
	pane.marked = switched(pane.activeTab, (tab) => tab?.marked)
	pane.disk = switched(pane.activeTab, (tab) => tab?.disk)
	pane.segments = switched(pane.activeTab, (tab) => tab?.segments)

	// Function: current
	// The active tab object (its cells are the pane's proxy targets).
	pane.current = () => pane.activeTab.value

	// Function: addTab
	// Appends a tab at `path` (default: the active tab's path), selects it and
	// refreshes it.
	pane.addTab = async (path) => {
		const tab = createTab({
			fs: pane.fs,
			path: path ?? (pane.current()?.path.value || fs.cwd?.() || "/"),
			label: pane.labels.acquire(),
			marks: pane.marks,
		})
		pane.tabs.set([...pane.tabs.value, tab])
		pane.activeIndex.set(pane.tabs.value.length - 1)
		await tab.refresh()
		return tab
	}

	// Function: closeTab
	// Closes the tab at `index`, releasing its label and marks. The last tab
	// cannot be closed.
	pane.closeTab = (index = pane.activeIndex.value) => {
		const tabs = pane.tabs.value.slice()
		if (tabs.length <= 1 || index < 0 || index >= tabs.length) return null
		const [closed] = tabs.splice(index, 1)
		pane.labels.release(closed.label)
		closed.dispose?.()
		closed.marked.release?.()
		const marks = { ...pane.marks.value }
		delete marks[closed.id]
		pane.marks.set(marks)
		pane.tabs.set(tabs)
		pane.activeIndex.set(Math.min(index, tabs.length - 1))
		return closed
	}

	// Function: selectTab
	// Selects the tab at `index`, clamped to the tab list.
	pane.selectTab = (index) => {
		const length = pane.tabs.value.length
		if (!length) return
		pane.activeIndex.set(Math.max(0, Math.min(index, length - 1)))
	}

	// Function: nextTab / prevTab
	// Cycles through the tabs.
	pane.nextTab = () => pane.selectTab((pane.activeIndex.value + 1) % pane.tabs.value.length)
	pane.prevTab = () =>
		pane.selectTab((pane.activeIndex.value - 1 + pane.tabs.value.length) % pane.tabs.value.length)

	// Function: useLabels
	// Rebinds the pane to a shared label allocator, relabelling its tabs in
	// order. Sessions use it so left and right tabs get distinct fileset names.
	pane.useLabels = (labels) => {
		pane.labels = labels
		pane.tabs.set(
			pane.tabs.value.map((tab) => {
				tab.label = labels.acquire()
				return tab
			}),
		)
	}

	// Function: refresh
	// Re-reads the active tab's directory.
	pane.refresh = () => pane.current()?.refresh()

	// Function: navigate
	// Moves the active tab to `path` and refreshes.
	pane.navigate = (path) => pane.current()?.navigate(path)

	// Function: up
	// Navigates the active tab to its parent directory.
	pane.up = () => pane.current()?.up()

	// Function: open
	// Opens the entry under the cursor in the active tab.
	pane.open = () => pane.current()?.open()

	// Function: currentEntry
	// The entry under the cursor in the active tab.
	pane.currentEntry = () => pane.current()?.currentEntry()

	// Function: toggleMark
	// Marks or unmarks the entry under the cursor in the active tab.
	pane.toggleMark = () => pane.current()?.toggleMark()

	// Function: clearFilter
	// Removes the active tab's filter.
	pane.clearFilter = () => pane.current()?.clearFilter()

	// Start with one tab so the pane is usable immediately.
	void pane.addTab(initialPath)
	return pane
}

export { createPane }
