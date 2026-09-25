// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/catalogue
// Registers the tcmd components and the OpenTUI renderables they need with
// the select.tui catalogue. Tags in templates are matched case-insensitively
// by select.tui, so `<FileList>` resolves `filelist`.

import { extend } from "select.tui"
import { Breadcrumbs } from "./views/breadcrumbs.js"
import { CommandPalette } from "./views/command-palette.js"
import { FileList } from "./views/file-list.js"
import { FilePreview } from "./views/file-preview.js"
import { Summary } from "./views/summary.js"
import { Toolbar } from "./views/toolbar.js"

let registered = false

// Function: registerComponents
// Idempotent component registration; imported for its side effect by the app.
function registerComponents() {
	if (registered) return catalogueTags()
	registered = true
	extend({
		breadcrumbs: Breadcrumbs,
		commandpalette: CommandPalette,
		filelist: FileList,
		filepreview: FilePreview,
		summary: Summary,
		toolbar: Toolbar,
	})
	return catalogueTags()
}

function catalogueTags() {
	return ["breadcrumbs", "commandpalette", "filelist", "filepreview", "summary", "toolbar"]
}

export { registerComponents }

// EOF
