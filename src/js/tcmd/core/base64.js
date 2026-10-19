// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-20

// Module: tcmd/core/base64
// Standard base64 for adapters that can only carry bytes as JSON text — the
// web API and the tinyjs bridge. Pure JavaScript: neither `Buffer` nor
// `btoa`/`atob` is guaranteed in every target (the desktop backend runs under
// txiki.js), and compressed previews stay small enough for a string.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

// Constant: LOOKUP
// Byte code -> 6-bit value, -1 for anything outside the alphabet.
const LOOKUP = (() => {
	const table = new Int16Array(128).fill(-1)
	for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i
	return table
})()

// Function: encodeBase64
// Base64 text for a byte array, with `=` padding.
function encodeBase64(bytes) {
	let text = ""
	for (let i = 0; i < bytes.length; i += 3) {
		const first = bytes[i]
		const second = i + 1 < bytes.length ? bytes[i + 1] : undefined
		const third = i + 2 < bytes.length ? bytes[i + 2] : undefined
		text += ALPHABET[first >> 2]
		text += ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)]
		text += second === undefined ? "=" : ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)]
		text += third === undefined ? "=" : ALPHABET[third & 0x3f]
	}
	return text
}

// Function: decodeBase64
// Bytes for base64 text; padding, whitespace and foreign characters are
// ignored, so a truncated or line-wrapped payload still decodes.
function decodeBase64(text) {
	const source = `${text ?? ""}`
	const bytes = new Uint8Array(Math.floor((source.length * 3) / 4))
	let length = 0
	let buffer = 0
	let bits = 0
	for (let i = 0; i < source.length; i++) {
		const code = source.charCodeAt(i)
		if (code === 61) break // "=" padding: nothing follows it.
		const value = code < LOOKUP.length ? LOOKUP[code] : -1
		if (value < 0) continue
		buffer = (buffer << 6) | value
		bits += 6
		if (bits >= 8) {
			bits -= 8
			bytes[length++] = (buffer >> bits) & 0xff
		}
	}
	return bytes.slice(0, length)
}

export { decodeBase64, encodeBase64 }

// EOF
