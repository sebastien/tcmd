// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/icons
// Nerd Font icons, in the spirit of yazi. `iconFor` maps a file entry to its
// kind icon (directory, symlink, device node), then a per-extension icon, then
// the generic file icon; a few basenames map directly too, so `Makefile`,
// `Dockerfile` and dotfiles like `.gitignore` get their icon even without a
// distinguishing extension. `sourceMarker` maps a command-panel entry's
// namespace (a CLI operation or a TinyCmd action) to its marker.
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

// Constant: SOURCE_ICON / SOURCE_TAG
// The namespace marker the command panel puts in front of each entry name:
// a terminal prompt for a CLI operation, a bolt for a TinyCmd action. Browsers
// lack the Nerd Font (and `TCMD_ICONS=0` opts out), so the same marker exists
// as a three-character tag that keeps the name column aligned either way.
const SOURCE_ICON = {
	cli: "\u{ebca}", // nf-cod-terminal_bash
	app: "\u{f0e7}", // nf-fa-bolt
}
const SOURCE_TAG = {
	cli: "cli",
	app: "app",
}

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

// Function: lucideIconFor
// Lucide's outline icons are used by the web renderers, where SVG works without
// a patched terminal font. The TUI keeps the detailed Nerd Font mapping above;
// the web uses a smaller set of semantic file-kind icons.
const LUCIDE_NAME_ICONS = {
	cmakelists: "file-code",
	dockerfile: "file-code",
	env: "settings",
	gitattributes: "settings",
	gitconfig: "settings",
	gitignore: "settings",
	gitmodules: "settings",
	gnumakefile: "file-code",
	license: "file-text",
	licence: "file-text",
	makefile: "file-code",
	npmrc: "settings",
	readme: "file-text",
}
const LUCIDE_EXTENSION_ICONS = {
	"7z": "file-archive",
	aac: "audio-lines",
	avi: "video",
	bmp: "file-image",
	bz2: "file-archive",
	c: "file-code",
	cc: "file-code",
	cjs: "file-code",
	clj: "file-code",
	cmake: "file-code",
	csv: "file-text",
	cfg: "settings",
	conf: "settings",
	cpp: "file-code",
	cs: "file-code",
	css: "file-code",
	d: "file-code",
	db: "database",
	diff: "file-code",
	ex: "file-code",
	exs: "file-code",
	env: "settings",
	flac: "audio-lines",
	gif: "file-image",
	go: "file-code",
	gql: "file-code",
	graphql: "file-code",
	gz: "file-archive",
	h: "file-code",
	hbs: "file-code",
	hs: "file-code",
	hpp: "file-code",
	htm: "file-code",
	html: "file-code",
	ini: "settings",
	java: "file-code",
	jar: "file-archive",
	jpeg: "file-image",
	jpg: "file-image",
	js: "file-code",
	jsx: "file-code",
	json: "file-code",
	kt: "file-code",
	kts: "file-code",
	less: "file-code",
	lock: "settings",
	log: "file-text",
	lua: "file-code",
	m4a: "audio-lines",
	md: "file-text",
	markdown: "file-text",
	mk: "file-code",
	mkv: "video",
	mov: "video",
	mp3: "audio-lines",
	mp4: "video",
	mjs: "file-code",
	nim: "file-code",
	ogg: "audio-lines",
	pdf: "file-text",
	perl: "file-code",
	patch: "file-code",
	php: "file-code",
	pl: "file-code",
	png: "file-image",
	ps1: "file-code",
	py: "file-code",
	r: "file-code",
	rb: "file-code",
	rar: "file-archive",
	rs: "file-code",
	sass: "file-code",
	scala: "file-code",
	scss: "file-code",
	sh: "file-code",
	sql: "file-code",
	sqlite: "database",
	sqlite3: "database",
	svg: "file-image",
	swift: "file-code",
	tar: "file-archive",
	text: "file-text",
	toml: "settings",
	ts: "file-code",
	tsv: "file-text",
	txt: "file-text",
	tsx: "file-code",
	vim: "file-code",
	vue: "file-code",
	wav: "audio-lines",
	webm: "video",
	webp: "file-image",
	xml: "file-code",
	xz: "file-archive",
	yaml: "file-code",
	yml: "file-code",
	zip: "file-archive",
	zsh: "file-code",
}

function lucideIconFor(entry) {
	if (!entry) return ""
	if (entry.isSymlink) return "link-2"
	if (entry.isDevice) return "cpu"
	if (entry.isDir) return "folder"

	const name = `${entry.name ?? ""}`
	const basename = name.slice(name.lastIndexOf("/") + 1)
	const extension = extensionOf(basename)
	const stem = extension ? basename.slice(0, -(extension.length + 1)) : basename
	const plain = (basename.startsWith(".") ? basename.slice(1) : basename).toLowerCase()
	return LUCIDE_NAME_ICONS[plain] ?? LUCIDE_NAME_ICONS[stem.toLowerCase()] ?? LUCIDE_EXTENSION_ICONS[extension] ?? "file"
}

// Function: iconsEnabled
// Whether rows show icons: on by default, `TCMD_ICONS=0|false|off` opts out
// for terminals without a Nerd Font.
function iconsEnabled(environment = globalThis.process?.env ?? {}) {
	const value = environment.TCMD_ICONS
	return value !== "0" && value !== "false" && value !== "off"
}

// Function: sourceMarker
// The marker a command-panel entry carries: the Nerd Font glyph when icons are
// on, the three-character tag otherwise (browsers lack the font).
function sourceMarker(source, icons) {
	if (icons) return SOURCE_ICON[source] ?? ""
	return SOURCE_TAG[source] ?? ""
}

export {
	DEVICE_ICON,
	DIR_ICON,
	FILE_ICON,
	SOURCE_ICON,
	SOURCE_TAG,
	SYMLINK_ICON,
	extensionOf,
	iconFor,
	iconsEnabled,
	lucideIconFor,
	sourceMarker,
}

// EOF
