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
// Environment: HOST (default 127.0.0.1, an IP literal: 0.0.0.0 or :: serves
// every interface), PORT (default 8787), TCMD_WEB_ROOT (default "/", like the
// TUI).

import { startWebServer } from "../src/js/tcmd/web/server.js"

if (import.meta.main) await startWebServer()

// EOF
