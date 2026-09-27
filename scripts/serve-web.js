// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: scripts/serve-web
// CLI for the web view server: serves `public/` plus the `/api/*` filesystem
// API (see `src/js/tcmd/web/server.js`). The page uses OPFS when the browser
// has it and falls back to the API otherwise, so both backends come from this
// one command.
//
// Environment: PORT (default 8787), TCMD_WEB_ROOT (default "/", like the TUI).

import { createWebServer } from "../src/js/tcmd/web/server.js"

const publicDir = new URL("../public/", import.meta.url)

if (!(await Bun.file(new URL("main.js", publicDir)).exists())) {
	console.error("public/main.js is missing: run `bun run web:build` first.")
	process.exit(1)
}

const { server, root } = createWebServer({ publicDir })

console.log(`tcmd web:      http://127.0.0.1:${server.port}`)
console.log(`filesystem API: /api/* rooted at ${root}`)
console.log("the page prefers OPFS and falls back to the API if unavailable")

// EOF
