// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components
// Manifest of the shared, renderer-agnostic component logic. Each module
// exports `createBehaviors(env)` and pure helpers; the TUI (`tui/catalogue`)
// and web (`web/catalogue`) bind them to their `.xml` / `.html` templates
// through the shared `bind` helper.

// Binding
export { bind } from "./bind.js"

// Behaviors
export { createBehaviors as appBehaviors, createEvents as appEvents, createInit as appInit } from "./App.js"
export { createBehaviors as bookmarkListBehaviors } from "./BookmarkList.js"
export { createBehaviors as bookmarkRowBehaviors } from "./BookmarkRow.js"
export { createBehaviors as breadcrumbsBehaviors } from "./Breadcrumbs.js"
export { createBehaviors as commandBarBehaviors } from "./CommandBar.js"
export { createBehaviors as commandItemBehaviors } from "./CommandItem.js"
export { createBehaviors as commandPaletteBehaviors } from "./CommandPalette.js"
export { createBehaviors as confirmBehaviors } from "./Confirm.js"
export { createBehaviors as crumbBehaviors } from "./Crumb.js"
export { createBehaviors as entryDetailBehaviors } from "./EntryDetail.js"
export { createBehaviors as fileListBehaviors } from "./FileList.js"
export { createBehaviors as filePreviewBehaviors } from "./FilePreview.js"
export { createBehaviors as fileRowBehaviors } from "./FileRow.js"
export { createBehaviors as filterBarBehaviors } from "./FilterBar.js"
export { createBehaviors as paneLabelBehaviors } from "./PaneLabel.js"
export { createBehaviors as paletteRowBehaviors } from "./PaletteRow.js"
export { createBehaviors as summaryBehaviors } from "./Summary.js"

// Helpers
export { formatCounts, formatDisk, formatMode, formatSize, formatTime } from "./format.js"
export { bookmarkRows, commandItemRows, crumbRows, fileRows, paletteRows } from "./rows.js"

// EOF
