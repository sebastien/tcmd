// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-18

// Module: tcmd/tui/syntax
// The TUI's syntax-highlighting palette: one `SyntaxStyle` (OpenTUI's
// tree-sitter style table) built from the active `tuiTheme`, so code previews
// read in the same colours as the rest of the workspace. The TUI-only half of
// the preview — the web renders plain text and never imports OpenTUI.
//
// The scope names are the standard tree-sitter captures the bundled queries
// emit (`keyword.return`, `function.method`, `punctuation.bracket`…).
// `SyntaxStyle#getStyleId` falls back from a dotted capture to its base name,
// so registering the bases here covers every variant without enumerating them.
// In the mono theme every colour token is `undefined`, so a scope keeps only
// its attributes (comment stays italic, headings stay bold) and the terminal's
// own foreground carries the rest.

import { SyntaxStyle } from "./opentui.js"
import { tuiTheme } from "./theme.js"

// Function: scopeStyles
// Maps each base capture to a style drawn from `theme`. Content colours reuse
// the listing palette (comments dimmer than plain text, strings the executable
// green, types the directory blue, literals the device purple), so a preview
// and a pane never disagree about what a colour means.
function scopeStyles(theme) {
	return {
		attribute: { fg: theme.tipFg },
		boolean: { fg: theme.tipFg },
		comment: { fg: theme.readonlyFg, italic: true },
		constant: { fg: theme.tipFg },
		constructor: { fg: theme.dirFg },
		embedded: { fg: theme.textFg },
		field: { fg: theme.devFg },
		function: { fg: theme.linkFg },
		import: { fg: theme.accentFg },
		keyword: { fg: theme.accentSecondaryFg, bold: true },
		label: { fg: theme.accentSecondaryFg },
		method: { fg: theme.linkFg },
		module: { fg: theme.accentFg },
		namespace: { fg: theme.accentFg },
		number: { fg: theme.tipFg },
		operator: { fg: theme.textSecondaryFg },
		parameter: { fg: theme.textFg },
		property: { fg: theme.devFg },
		punctuation: { fg: theme.textSecondaryFg },
		string: { fg: theme.execFg },
		tag: { fg: theme.accentSecondaryFg },
		type: { fg: theme.dirFg },
		variable: { fg: theme.textFg },
		"markup.heading": { fg: theme.textHeadingFg, bold: true },
		"markup.italic": { italic: true },
		"markup.link": { fg: theme.linkFg, underline: true },
		"markup.link.label": { fg: theme.linkFg },
		"markup.link.url": { fg: theme.linkFg, underline: true },
		"markup.list": { fg: theme.accentSecondaryFg },
		"markup.quote": { fg: theme.readonlyFg, italic: true },
		"markup.raw": { fg: theme.execFg },
		"markup.strong": { bold: true },
	}
}

// Function: createSyntaxStyle
// Builds a `SyntaxStyle` for `theme`.
function createSyntaxStyle(theme = tuiTheme) {
	return SyntaxStyle.fromStyles(scopeStyles(theme))
}

// The style is a singleton: the theme resolves once per process, and every
// `code` renderable shares one native handle.
let sharedStyle = null

// Function: syntaxStyle
// The shared `SyntaxStyle` for the active theme, built on first use.
function syntaxStyle(theme = tuiTheme) {
	sharedStyle ??= createSyntaxStyle(theme)
	return sharedStyle
}

export { syntaxStyle }

// EOF
