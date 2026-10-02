// Helpers for rendering the TUI under select.tui's test renderer.

import { cell } from "select/state/cells"
import { createPane, createSession, load } from "../../src/js/tcmd/core/index.js"
import { createAppComponent } from "../../src/js/tcmd/tui/app.js"
import { createMockFs } from "./mock-fs.js"

// Re-render after the microtask render queue drains. A command updates a cell,
// which schedules an App render, which re-syncs child inputs, which schedules
// the child render: two microtask turns plus the frame.
async function settle(setup) {
	for (let i = 0; i < 4; i++) {
		await Promise.resolve()
	}
	await setup.renderOnce()
}

// Mount the app over `tree`, feeding the presentation the real viewport as the
// TUI entry point does.
async function makeSetup(tree, width = 100, height = 20) {
	const fs = createMockFs(tree)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/" })
	const session = createSession({ fs, left, right })
	await load(session)
	const size = cell({ width, height })
	const App = createAppComponent(session, { size })
	const { testRender } = await import("select.tui")
	const setup = await testRender(App, { width, height })
	await setup.renderOnce()
	return { setup, session, size }
}

export { makeSetup, settle }
