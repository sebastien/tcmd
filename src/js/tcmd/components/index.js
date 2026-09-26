// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components
// Manifest of the shared, renderer-agnostic component logic. Each module
// exports `createBehaviors(env)` and pure helpers; the TUI (`tui/catalogue`)
// and web (`web/catalogue`) bind them to their `.xml` / `.html` templates.

export { createBehaviors as appBehaviors, createEvents as appEvents, createInit as appInit } from "./App.js"
export { createBehaviors as breadcrumbsBehaviors } from "./Breadcrumbs.js"
export { createBehaviors as commandPaletteBehaviors } from "./CommandPalette.js"
export { createBehaviors as crumbBehaviors } from "./Crumb.js"
export { createBehaviors as fileListBehaviors } from "./FileList.js"
export { createBehaviors as filePreviewBehaviors } from "./FilePreview.js"
export { createBehaviors as fileRowBehaviors } from "./FileRow.js"
export { createBehaviors as paletteRowBehaviors } from "./PaletteRow.js"
export { createBehaviors as summaryBehaviors } from "./Summary.js"
export { createBehaviors as toolItemBehaviors } from "./ToolItem.js"
export { createBehaviors as toolbarBehaviors } from "./Toolbar.js"
export { formatCounts, formatDisk, formatSize } from "./format.js"
export { read } from "./read.js"
export { breadcrumbRows, fileRows, paletteRows, toolRows } from "./rows.js"
