// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/web
// Web entry point: builds the select.js root component for a session and
// mounts it into a DOM host. The model/controller is the shared `tcmd/core`;
// only the presentation differs from the TUI.

import { createWebApp } from "./app.js"

// Function: main
// Mounts the web UI for `session` into `selector` (default "#app").
function main(session, selector = "#app", options = {}) {
	const App = createWebApp(session, options)
	return App.new().mount(selector)
}

export { main }

// EOF
