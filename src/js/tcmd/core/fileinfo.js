// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-11-01

// Module: tcmd/core/fileinfo
// Content-based file identification for the `file` operation. The format is
// read from the leading bytes (magic signatures first, then encoding and text
// shape), not from the name, so a `.txt` renamed to `.png` reports what it
// actually is. Pure and renderer-free: `detectFormat` matches a signature,
// `describeBytes` adds the encoding/text statistics, and `formatMismatch`
// compares the detected content with the name's extension.

// Constant: SAMPLE_BYTES
// Bytes the `file` operation reads for one entry. Large enough for the tar
// `ustar` marker at offset 257 and for useful line counts.
const SAMPLE_BYTES = 65536

// Function: asciiAt
// The ASCII text at `offset` (`length` characters), or "" when the head is
// shorter.
function asciiAt(bytes, offset, length) {
	let text = ""
	for (let i = 0; i < length; i++) {
		const byte = bytes[offset + i]
		if (byte === undefined) return ""
		text += String.fromCharCode(byte)
	}
	return text
}

// Function: starts
// True when `bytes` starts with `signature` at `offset`.
function starts(bytes, signature, offset = 0) {
	for (let i = 0; i < signature.length; i++) {
		if (bytes[offset + i] !== signature[i]) return false
	}
	return true
}

// Function: asciiStarts
// True when `bytes` starts with the ASCII text `text` at `offset`.
function asciiStarts(bytes, text, offset = 0) {
	return asciiAt(bytes, offset, text.length) === text
}

// Function: riffKind
// The four-character form of a RIFF container at offset 8 ("WAVE", "AVI ",
// "WEBP"), or "".
function riffKind(bytes) {
	return asciiStarts(bytes, "RIFF", 0) ? asciiAt(bytes, 8, 4) : ""
}

// Constant: SIGNATURES
// Ordered magic signatures. `exts` lists the names a format normally carries,
// used by `formatMismatch`; an empty list means the format is content-only.
const SIGNATURES = [
	// Images
	{ label: "PNG image", mime: "image/png", kind: "image", exts: ["png"], test: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
	{ label: "JPEG image", mime: "image/jpeg", kind: "image", exts: ["jpg", "jpeg", "jpe"], test: (b) => starts(b, [0xff, 0xd8, 0xff]) },
	{ label: "GIF image", mime: "image/gif", kind: "image", exts: ["gif"], test: (b) => asciiStarts(b, "GIF87a") || asciiStarts(b, "GIF89a") },
	{ label: "WebP image", mime: "image/webp", kind: "image", exts: ["webp"], test: (b) => riffKind(b) === "WEBP" },
	{ label: "BMP image", mime: "image/bmp", kind: "image", exts: ["bmp"], test: (b) => asciiStarts(b, "BM") },
	{ label: "TIFF image", mime: "image/tiff", kind: "image", exts: ["tif", "tiff"], test: (b) => starts(b, [0x49, 0x49, 0x2a, 0x00]) || starts(b, [0x4d, 0x4d, 0x00, 0x2a]) },
	{ label: "AVIF image", mime: "image/avif", kind: "image", exts: ["avif"], test: (b) => asciiStarts(b, "ftypavif", 4) },
	{ label: "HEIC image", mime: "image/heic", kind: "image", exts: ["heic", "heif"], test: (b) => asciiStarts(b, "ftypheic", 4) || asciiStarts(b, "ftypheix", 4) || asciiStarts(b, "ftypmif1", 4) },
	// Audio and video
	{ label: "WAV audio", mime: "audio/wav", kind: "media", exts: ["wav"], test: (b) => riffKind(b) === "WAVE" },
	{ label: "AVI video", mime: "video/x-msvideo", kind: "media", exts: ["avi"], test: (b) => riffKind(b) === "AVI " },
	{ label: "OGG media", mime: "audio/ogg", kind: "media", exts: ["ogg", "oga", "ogv", "opus"], test: (b) => asciiStarts(b, "OggS") },
	{ label: "FLAC audio", mime: "audio/flac", kind: "media", exts: ["flac"], test: (b) => asciiStarts(b, "fLaC") },
	{ label: "MP3 audio", mime: "audio/mpeg", kind: "media", exts: ["mp3"], test: (b) => asciiStarts(b, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
	{ label: "MP4/QuickTime media", mime: "video/mp4", kind: "media", exts: ["mp4", "m4v", "m4a", "mov"], test: (b) => asciiStarts(b, "ftyp", 4) },
	{ label: "Matroska/WebM media", mime: "video/webm", kind: "media", exts: ["mkv", "webm"], test: (b) => starts(b, [0x1a, 0x45, 0xdf, 0xa3]) },
	// Documents and structured data
	{ label: "PDF document", mime: "application/pdf", kind: "document", exts: ["pdf"], test: (b) => asciiStarts(b, "%PDF-") },
	{ label: "PostScript document", mime: "application/postscript", kind: "document", exts: ["ps", "eps"], test: (b) => asciiStarts(b, "%!PS") },
	{ label: "RTF document", mime: "application/rtf", kind: "document", exts: ["rtf"], test: (b) => asciiStarts(b, "{\\rtf") },
	{ label: "SQLite database", mime: "application/vnd.sqlite3", kind: "data", exts: ["sqlite", "sqlite3", "db"], test: (b) => asciiStarts(b, "SQLite format 3\u0000") },
	// Archives and compression
	{ label: "gzip compressed", mime: "application/gzip", kind: "archive", exts: ["gz", "tgz"], test: (b) => starts(b, [0x1f, 0x8b]) },
	{ label: "bzip2 compressed", mime: "application/x-bzip2", kind: "archive", exts: ["bz2", "tbz2"], test: (b) => asciiStarts(b, "BZh") },
	{ label: "xz compressed", mime: "application/x-xz", kind: "archive", exts: ["xz", "txz"], test: (b) => starts(b, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) },
	{ label: "Zstandard compressed", mime: "application/zstd", kind: "archive", exts: ["zst", "zstd"], test: (b) => starts(b, [0x28, 0xb5, 0x2f, 0xfd]) },
	{ label: "LZ4 compressed", mime: "application/x-lz4", kind: "archive", exts: ["lz4"], test: (b) => starts(b, [0x04, 0x22, 0x4d, 0x18]) },
	{ label: "ZIP archive", mime: "application/zip", kind: "archive", exts: ["zip", "jar", "apk", "docx", "xlsx", "pptx", "epub", "odt", "ods", "odp"], test: (b) => asciiStarts(b, "PK\u0003\u0004") || asciiStarts(b, "PK\u0005\u0006") || asciiStarts(b, "PK\u0007\u0008") },
	{ label: "7-Zip archive", mime: "application/x-7z-compressed", kind: "archive", exts: ["7z"], test: (b) => starts(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) },
	{ label: "RAR archive", mime: "application/vnd.rar", kind: "archive", exts: ["rar"], test: (b) => asciiStarts(b, "Rar!\u001a\u0007") },
	{ label: "tar archive", mime: "application/x-tar", kind: "archive", exts: ["tar"], test: (b) => asciiStarts(b, "ustar", 257) },
	{ label: "OLE2 compound document", mime: "application/x-ole-storage", kind: "document", exts: ["doc", "xls", "ppt", "msi"], test: (b) => starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
	// Executables
	{ label: "ELF executable", mime: "application/x-executable", kind: "executable", exts: ["elf", "so", "o"], test: (b) => starts(b, [0x7f, 0x45, 0x4c, 0x46]) },
	{ label: "Mach-O executable", mime: "application/x-mach-binary", kind: "executable", exts: [], test: (b) => starts(b, [0xfe, 0xed, 0xfa, 0xce]) || starts(b, [0xce, 0xfa, 0xed, 0xfe]) || starts(b, [0xfe, 0xed, 0xfa, 0xcf]) || starts(b, [0xcf, 0xfa, 0xed, 0xfe]) },
	{ label: "Java class", mime: "application/java-vm", kind: "executable", exts: ["class"], test: (b) => starts(b, [0xca, 0xfe, 0xba, 0xbe]) },
	{ label: "Windows executable", mime: "application/vnd.microsoft.portable-executable", kind: "executable", exts: ["exe", "dll"], test: (b) => asciiStarts(b, "MZ") },
	{ label: "WebAssembly module", mime: "application/wasm", kind: "executable", exts: ["wasm"], test: (b) => starts(b, [0x00, 0x61, 0x73, 0x6d]) },
]

// Constant: BOMS
// Byte-order marks, longest first so UTF-32 wins over its UTF-16 prefix.
const BOMS = [
	{ bytes: [0x00, 0x00, 0xfe, 0xff], label: "UTF-32 BE (BOM)", decoder: null },
	{ bytes: [0xff, 0xfe, 0x00, 0x00], label: "UTF-32 LE (BOM)", decoder: null },
	{ bytes: [0xef, 0xbb, 0xbf], label: "UTF-8 (BOM)", decoder: "utf-8" },
	{ bytes: [0xfe, 0xff], label: "UTF-16 BE (BOM)", decoder: "utf-16be" },
	{ bytes: [0xff, 0xfe], label: "UTF-16 LE (BOM)", decoder: "utf-16le" },
]

// Constant: TEXT_EXTS
// Extensions whose content is expected to be text. A binary body under one of
// these names is reported as a mismatch.
const TEXT_EXTS = new Set([
	"txt", "text", "md", "markdown", "rst", "log", "csv", "tsv",
	"js", "mjs", "cjs", "jsx", "ts", "tsx", "json", "jsonc", "xml", "svg",
	"html", "htm", "css", "scss", "sass", "less", "yml", "yaml", "toml",
	"ini", "conf", "cfg", "env", "sh", "bash", "zsh", "fish", "py", "rb",
	"go", "rs", "c", "h", "cc", "cpp", "hpp", "java", "kt", "zig", "lua",
	"sql", "tex", "org", "adoc", "diff", "patch", "gitignore",
])

// Constant: BINARY_EXTS
// Every extension a magic signature claims, so a text body under one of them
// is reported as a mismatch.
const BINARY_EXTS = new Set(SIGNATURES.flatMap((signature) => signature.exts))

// Function: detectFormat
// The signature matching `bytes`, or null when the head carries no known
// magic. Empty input is not a format.
function detectFormat(bytes) {
	for (const signature of SIGNATURES) {
		if (signature.test(bytes)) {
			return { label: signature.label, mime: signature.mime, kind: signature.kind, exts: signature.exts }
		}
	}
	return null
}

// Function: isAscii
// True when every sampled byte is 7-bit.
function isAscii(bytes) {
	for (let i = 0; i < bytes.length; i++) if (bytes[i] > 0x7f) return false
	return true
}

// Function: hasControlByte
// True when the head carries a control byte that text does not use. Tabs,
// newlines, form feeds and carriage returns are allowed; NUL and ESC are not.
function hasControlByte(bytes) {
	for (let i = 0; i < bytes.length; i++) {
		const byte = bytes[i]
		if (byte < 9 || (byte > 13 && byte < 32) || byte === 0x7f) return true
	}
	return false
}

// Function: decodeUtf8
// Strict UTF-8 decoding, or null when the head is not UTF-8. A truncated head
// may end mid-sequence, so the last few bytes are retried when `partial`.
function decodeUtf8(bytes, partial) {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
	} catch (error) {
		if (!partial) return null
	}
	for (let cut = 1; cut <= 3 && cut < bytes.length; cut++) {
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytes.length - cut))
		} catch (error) {
			// Try a shorter tail.
		}
	}
	return null
}

// Function: guessUtf16
// UTF-16 without a BOM: ASCII text puts NULs on every other byte. Returns
// "utf-16le"/"utf-16be", or null.
function guessUtf16(bytes) {
	const sample = bytes.subarray(0, Math.min(bytes.length, 4096))
	if (sample.length < 2) return null
	let even = 0
	let odd = 0
	for (let i = 0; i < sample.length; i++) {
		if (sample[i] !== 0) continue
		if (i % 2 === 0) even++
		else odd++
	}
	const half = sample.length / 2
	if (odd > half * 0.4 && even < half * 0.05) return "utf-16le"
	if (even > half * 0.4 && odd < half * 0.05) return "utf-16be"
	return null
}

// Function: decodeText
// `{ encoding, text }` for a text head, or null when the bytes are not text.
// `text` is null for UTF-32, which the platform decoders do not handle: the
// encoding is still reported, without line statistics.
function decodeText(bytes, partial) {
	for (const bom of BOMS) {
		if (!starts(bytes, bom.bytes)) continue
		if (!bom.decoder) return { encoding: bom.label, text: null }
		try {
			return { encoding: bom.label, text: new TextDecoder(bom.decoder).decode(bytes) }
		} catch (error) {
			return { encoding: bom.label, text: null }
		}
	}
	// ASCII-range UTF-16 also decodes as UTF-8 containing NULs: identify
	// the alternating NUL pattern before accepting that UTF-8 result.
	const utf16 = guessUtf16(bytes)
	if (utf16) {
		try {
			const text = new TextDecoder(utf16).decode(bytes)
			// Alternating NULs alone can occur in binary data. Reject the same
			// non-text controls as the UTF-8 path, after decoding its code units.
			if (/[\u0000-\u0008\u000e-\u001f\u007f]/.test(text)) return null
			return { encoding: utf16 === "utf-16le" ? "UTF-16 LE" : "UTF-16 BE", text }
		} catch (error) {
			return { encoding: utf16 === "utf-16le" ? "UTF-16 LE" : "UTF-16 BE", text: null }
		}
	}
	const utf8 = decodeUtf8(bytes, partial)
	if (utf8 !== null) return { encoding: isAscii(bytes) ? "ASCII" : "UTF-8", text: utf8 }
	return null
}

// Function: countLines
// Lines in a decoded text head; a final line without a newline still counts.
function countLines(text) {
	if (!text) return 0
	let lines = 0
	for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++
	return text.endsWith("\n") ? lines : lines + 1
}

// Function: shebang
// The interpreter line of a script head ("#!/usr/bin/env node"), or null.
function shebang(text) {
	if (!text?.startsWith("#!")) return null
	const line = text.slice(2).split("\n", 1)[0].trim()
	return line || null
}

// Function: textDescription
// The describeBytes result for a decoded text head: a script names its
// interpreter, any other text names its encoding.
function textDescription(decoded, partial) {
	const interpreter = decoded.text ? shebang(decoded.text) : null
	return {
		kind: "text",
		label: interpreter ? `script (${interpreter})` : `${decoded.encoding} text`,
		mime: interpreter ? "text/x-script" : "text/plain",
		exts: [],
		encoding: decoded.encoding,
		binary: false,
		lines: decoded.text === null ? null : countLines(decoded.text),
		partial,
	}
}

// Function: describeBytes
// Identifies a head and, for text, its encoding and line count. `partial`
// means the head is only the file's beginning, so a truncated tail is not a
// format error and the line count covers the sample.
function describeBytes(bytes, { partial = false } = {}) {
	const head = bytes ?? new Uint8Array()
	if (!head.length) {
		return { kind: "empty", label: "empty file", mime: "inode/x-empty", exts: [], encoding: null, binary: false, lines: 0, partial: false }
	}
	const decoded = decodeText(head, partial)
	// A byte-order mark outranks the magic table: UTF-16LE starts with FF FE,
	// which the MP3 frame-sync heuristic would otherwise claim.
	if (decoded?.encoding?.includes("(BOM)")) return textDescription(decoded, partial)
	const signature = detectFormat(head)
	if (signature) {
		return { ...signature, encoding: null, binary: true, lines: null, partial }
	}
	if (decoded) {
		// UTF-16/32 text carries NULs by design, so only UTF-8/ASCII heads are
		// checked for control bytes.
		const wide = decoded.encoding?.startsWith("UTF-16") || decoded.encoding?.startsWith("UTF-32")
		if (wide || !hasControlByte(head)) return textDescription(decoded, partial)
	}
	return { kind: "binary", label: "binary data", mime: "application/octet-stream", exts: [], encoding: null, binary: true, lines: null, partial }
}

// Function: formatMismatch
// A note when the detected content contradicts the extension: a PNG under
// `.txt`, or text under `.png`. Unknown extensions are never flagged.
function formatMismatch(info, ext) {
	const name = `${ext ?? ""}`.toLowerCase()
	if (!name || !info || info.kind === "empty") return null
	if (info.kind === "text") {
		if (BINARY_EXTS.has(name) && !TEXT_EXTS.has(name)) {
			return `extension .${name} suggests a binary format, but the content is ${info.encoding ?? "text"}`
		}
		return null
	}
	if (!TEXT_EXTS.has(name) && !BINARY_EXTS.has(name)) return null
	if (info.exts?.length && !info.exts.includes(name)) {
		return `extension .${name} does not match ${info.label}`
	}
	if (!info.exts?.length && TEXT_EXTS.has(name)) {
		return `extension .${name} suggests text, but the content is binary`
	}
	return null
}

export { BINARY_EXTS, SAMPLE_BYTES, TEXT_EXTS, countLines, decodeText, describeBytes, detectFormat, formatMismatch }

// EOF
