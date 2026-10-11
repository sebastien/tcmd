// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/icons
// Nerd Font icon for a file entry, in the spirit of yazi: a kind icon
// (directory, symlink, device node) wins, then a per-extension icon, then the
// generic file icon. A few basenames map directly too, so `Makefile`,
// `Dockerfile` and dotfiles like `.gitignore` get their icon even without a
// distinguishing extension.
//
// The glyphs are Nerd Font codepoints (from `glyphnames.json`), so they only
// render on a terminal patched with a Nerd Font: rows show them when the
// renderer environment enables them (`env.icons`, resolved from `TCMD_ICONS`
// in `tui/catalogue.js`; `TCMD_ICONS=0|false|off` opts out, and the web view
// never enables it because browsers lack the font).
//
// Pure string mapping: no Node builtins, no renderer imports, so both
// catalogues (TUI and web) share it.

// Constant: DIR_ICON, SYMLINK_ICON, DEVICE_ICON, FILE_ICON
// Kind icons. Symlinks read as a chain (matching `nameFg`, where a link wins
// over its target kind, like `dircolors`).
const DIR_ICON = "\u{f07b}" // nf-fa-folder
const SYMLINK_ICON = "\u{f0c1}" // nf-fa-link
const DEVICE_ICON = "\u{e795}" // nf-dev-terminal
const FILE_ICON = "\u{f016}" // nf-fa-file_o

// Constant: NAME_ICONS
// Basename (lowercase, leading dot stripped) → glyph, checked before the
// extension table.
const NAME_ICONS = {
	"cmakelists": "\u{e794}", // nf-dev-cmake
	"dockerfile": "\u{e650}", // nf-seti-docker
	"gnumakefile": "\u{e673}", // nf-seti-makefile
	"gitattributes": "\u{e65d}", // nf-seti-git
	"gitconfig": "\u{e65d}", // nf-seti-git
	"gitignore": "\u{e65d}", // nf-seti-git
	"gitmodules": "\u{e65d}", // nf-seti-git
	"license": "\u{e60a}", // nf-seti-license
	"licence": "\u{e60a}", // nf-seti-license
	"makefile": "\u{e673}", // nf-seti-makefile
	"npmrc": "\u{e616}", // nf-seti-npm
	"readme": "\u{e609}", // nf-seti-markdown
}

// Constant: EXTENSION_ICONS
// Extension (lowercase, no dot) → glyph. The icons are the seti theme's — the
// same source yazi draws from.
const EXTENSION_ICONS = {
	// Languages
	"c": "\u{e649}", // nf-seti-c
	"cc": "\u{e646}", // nf-seti-cpp
	"clj": "\u{e642}", // nf-seti-clojure
	"cpp": "\u{e646}", // nf-seti-cpp
	"cs": "\u{e648}", // nf-seti-c_sharp
	"d": "\u{e651}", // nf-seti-d
	"ex": "\u{e62d}", // nf-seti-elixir
	"exs": "\u{e62d}", // nf-seti-elixir
	"go": "\u{e627}", // nf-seti-go
	"gql": "\u{e662}", // nf-seti-graphql
	"graphql": "\u{e662}", // nf-seti-graphql
	"h": "\u{e649}", // nf-seti-c
	"hbs": "\u{e60f}", // nf-seti-mustache
	"hs": "\u{e61f}", // nf-seti-haskell
	"hpp": "\u{e646}", // nf-seti-cpp
	"java": "\u{e66d}", // nf-seti-java
	"js": "\u{e60c}", // nf-seti-javascript
	"cjs": "\u{e60c}", // nf-seti-javascript
	"mjs": "\u{e60c}", // nf-seti-javascript
	"jsx": "\u{e625}", // nf-seti-react
	"kt": "\u{e634}", // nf-seti-kotlin
	"kts": "\u{e634}", // nf-seti-kotlin
	"lua": "\u{e620}", // nf-seti-lua
	"nim": "\u{e677}", // nf-seti-nim
	"perl": "\u{e67e}", // nf-seti-perl
	"pl": "\u{e67e}", // nf-seti-perl
	"php": "\u{e608}", // nf-seti-php
	"ps1": "\u{e691}", // nf-seti-shell
	"py": "\u{e606}", // nf-seti-python
	"r": "\u{e68a}", // nf-seti-r
	"rb": "\u{e605}", // nf-seti-ruby
	"rs": "\u{e68b}", // nf-seti-rust
	"scala": "\u{e68e}", // nf-seti-scala
	"sh": "\u{e691}", // nf-seti-shell
	"sql": "\u{e7c4}", // nf-dev-sqlite
	"swift": "\u{e699}", // nf-seti-swift
	"ts": "\u{e628}", // nf-seti-typescript
	"tsx": "\u{e625}", // nf-seti-react
	"vim": "\u{e7c5}", // nf-dev-vim
	"zsh": "\u{e691}", // nf-seti-shell
	// Web
	"css": "\u{e614}", // nf-seti-css
	"htm": "\u{e60e}", // nf-seti-html
	"html": "\u{e60e}", // nf-seti-html
	"json": "\u{e60b}", // nf-seti-json
	"less": "\u{e614}", // nf-seti-css
	"sass": "\u{e603}", // nf-seti-sass
	"scss": "\u{e603}", // nf-seti-sass
	"svg": "\u{e698}", // nf-seti-svg
	"vue": "\u{e6a0}", // nf-seti-vue
	"xml": "\u{e619}", // nf-seti-xml
	"yaml": "\u{e6a8}", // nf-seti-yml
	"yml": "\u{e6a8}", // nf-seti-yml
	// Data and docs
	"csv": "\u{f0218}", // nf-md-file_delimited
	"log": "\u{e64e}", // nf-seti-text
	"pdf": "\u{e67d}", // nf-seti-pdf
	"toml": "\u{e6b2}", // nf-custom-toml
	"tsv": "\u{f0218}", // nf-md-file_delimited
	"txt": "\u{e64e}", // nf-seti-text
	// Media
	"avi": "\u{e69f}", // nf-seti-video
	"flac": "\u{e638}", // nf-seti-audio
	"gif": "\u{e60d}", // nf-seti-image
	"jpeg": "\u{e60d}", // nf-seti-image
	"jpg": "\u{e60d}", // nf-seti-image
	"m4a": "\u{e638}", // nf-seti-audio
	"mkv": "\u{e69f}", // nf-seti-video
	"mov": "\u{e69f}", // nf-seti-video
	"mp3": "\u{e638}", // nf-seti-audio
	"mp4": "\u{e69f}", // nf-seti-video
	"ogg": "\u{e638}", // nf-seti-audio
	"png": "\u{e60d}", // nf-seti-image
	"wav": "\u{e638}", // nf-seti-audio
	"webm": "\u{e69f}", // nf-seti-video
	"webp": "\u{e60d}", // nf-seti-image
	// Archives and misc
	"7z": "\u{e6aa}", // nf-seti-zip
	"bz2": "\u{e6aa}", // nf-seti-zip
	"cfg": "\u{e615}", // nf-seti-config
	"conf": "\u{e615}", // nf-seti-config
	"db": "\u{e7c4}", // nf-dev-sqlite
	"diff": "\u{f440}", // nf-oct-diff
	"env": "\u{e615}", // nf-seti-config
	"gz": "\u{e6aa}", // nf-seti-zip
	"ini": "\u{e615}", // nf-seti-config
	"jar": "\u{e6aa}", // nf-seti-zip
	"lock": "\u{e672}", // nf-seti-lock
	"patch": "\u{f440}", // nf-oct-diff
	"rar": "\u{e6aa}", // nf-seti-zip
	"tar": "\u{e6aa}", // nf-seti-zip
	"xz": "\u{e6aa}", // nf-seti-zip
	"zip": "\u{e6aa}", // nf-seti-zip
	// Tooling
	"cmake": "\u{e794}", // nf-dev-cmake
	"mk": "\u{e673}", // nf-seti-makefile
}

// Function: extensionOf
// Lowercase extension without the dot. A leading dot (dotfile) or a trailing
// dot means "no extension".
function extensionOf(name) {
	const base = `${name ?? ""}`
	const dot = base.lastIndexOf(".")
	if (dot <= 0 || dot === base.length - 1) return ""
	return base.slice(dot + 1).toLowerCase()
}

// Function: iconFor
// The Nerd Font glyph for an entry: kind first (symlink wins over directory,
// matching `nameFg`), then the basename, then the extension, then the generic
// file icon.
function iconFor(entry) {
	if (!entry) return ""
	if (entry.isSymlink) return SYMLINK_ICON
	if (entry.isDevice) return DEVICE_ICON
	if (entry.isDir) return DIR_ICON
	const name = `${entry.name ?? ""}`
	const plain = (name.startsWith(".") ? name.slice(1) : name).toLowerCase()
	return NAME_ICONS[plain] ?? EXTENSION_ICONS[extensionOf(name)] ?? FILE_ICON
}

// Function: iconsEnabled
// Whether rows show icons: on by default, `TCMD_ICONS=0|false|off` opts out
// for terminals without a Nerd Font.
function iconsEnabled(environment = globalThis.process?.env ?? {}) {
	const value = environment.TCMD_ICONS
	return value !== "0" && value !== "false" && value !== "off"
}

export { DEVICE_ICON, DIR_ICON, FILE_ICON, SYMLINK_ICON, extensionOf, iconFor, iconsEnabled }

// EOF
