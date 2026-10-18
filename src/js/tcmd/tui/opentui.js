// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-18

// Module: tcmd/tui/opentui
// The OpenTUI classes the TUI registers as host tags (`code`, `image`) — and
// the `SyntaxStyle`/filetype helpers they need — resolved from the *same*
// OpenTUI copy `select.tui` itself binds its renderables to.
//
// A plain `import … from "@opentui/core"` can land on a different physical
// copy: in a source checkout `select.tui` is symlinked with its own
// `node_modules`, so the repo and the renderer each get an `@opentui/core` and
// their renderable base classes stop matching (a code renderable from one copy
// cannot be mounted in the other's tree — OpenTUI throws on the first
// destroy). Resolving `@opentui/core` from wherever `select.tui` resolves its
// own dependencies keeps a single instance. In a normal install both resolve
// to the one hoisted copy, so this is a no-op there.

import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const requireHere = createRequire(import.meta.url)
const requireFromSelectTui = createRequire(requireHere.resolve("select.tui"))
const coreUrl = pathToFileURL(requireFromSelectTui.resolve("@opentui/core")).href

const core = await import(coreUrl)

const { CodeRenderable, ImageRenderable, pathToFiletype, SyntaxStyle, createTextAttributes } = core

export { CodeRenderable, ImageRenderable, pathToFiletype, SyntaxStyle, createTextAttributes }

// EOF
