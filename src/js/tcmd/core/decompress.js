// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-20

// Module: tcmd/core/decompress
// Head decompression for compressed previews. `core/session` reads a bounded
// run of the file's raw bytes through the filesystem adapter and hands it here;
// the result is the leading decompressed text (never more than the requested
// budget), which the preview treats exactly like a plain text head.
//
// Gzip uses the platform's `DecompressionStream` (Bun and every browser ship
// it). Bzip2 has no such primitive, so the vendored decoder does the work; its
// output is a binary string that is decoded as UTF-8 here.

import { bzip2 } from "../vendor/bzip2.js"
import { PREVIEW_BYTES } from "./preview.js"

// Constant: BZIP2_BLOCK_BYTES
// A bzip2 stream decodes one block at a time and cannot emit anything until
// the whole block is in hand. Block size 9 holds at most 900 kB, so reading
// this much compressed data always covers the first block (plus its header).
const BZIP2_BLOCK_BYTES = 1024 * 1024

// Function: compressedBytes
// How many raw bytes the adapter should read for a compression format: gzip
// can be streamed and a preview-sized run is plenty; bzip2 needs its first
// whole block.
function compressedBytes(compression) {
	return compression === "bzip2" ? BZIP2_BLOCK_BYTES : PREVIEW_BYTES
}

// Function: decompressHead
// Leading `maxBytes` of decompressed text for `compression` ("gzip" or
// "bzip2"). Throws on a corrupt or unsupported stream; callers fall back to a
// metadata card.
async function decompressHead(bytes, compression, maxBytes = PREVIEW_BYTES) {
	if (compression === "gzip") return gunzipHead(bytes, maxBytes)
	if (compression === "bzip2") return bunzip2Head(bytes, maxBytes)
	throw new Error(`unsupported compression: ${compression}`)
}

// Function: gunzipHead
// Streams gzip members and stops at `maxBytes` of output. A truncated head is
// fine: the reader is cancelled once the budget is spent or the input ends.
async function gunzipHead(bytes, maxBytes) {
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
	const reader = stream.getReader()
	const chunks = []
	let length = 0
	try {
		while (length < maxBytes) {
			const { value, done } = await reader.read()
			if (done) break
			if (!value?.length) continue
			chunks.push(value)
			length += value.length
		}
	} finally {
		await reader.cancel().catch(() => {})
	}
	return decodeBytes(chunks, maxBytes)
}

// Function: bunzip2Head
// Decodes blocks until `maxBytes` of output or the stream terminator. The
// decoder yields one byte per char code, so the collected string is converted
// back to bytes before UTF-8 decoding.
function bunzip2Head(bytes, maxBytes) {
	let chunks
	try {
		const bits = bzip2.array(bytes)
		const size = bzip2.header(bits)
		chunks = []
		let length = 0
		while (length < maxBytes) {
			const chunk = bzip2.decompress(bits, size, maxBytes - length)
			if (chunk === -1) break
			chunks.push(chunk)
			length += chunk.length
		}
	} catch (error) {
		// The vendored decoder throws bare strings.
		throw error instanceof Error ? error : new Error(`${error}`)
	}
	return decodeBytes(chunks.map(byteString), maxBytes)
}

// Function: byteString
// The vendored decoder's char codes are bytes, not text.
function byteString(text) {
	const bytes = new Uint8Array(text.length)
	for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff
	return bytes
}

// Function: decodeBytes
// Concatenates the chunks (bounded to `maxBytes`) and decodes them as UTF-8.
function decodeBytes(chunks, maxBytes) {
	const total = Math.min(
		chunks.reduce((size, chunk) => size + chunk.length, 0),
		maxBytes,
	)
	const bytes = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		if (offset >= total) break
		const take = Math.min(chunk.length, total - offset)
		bytes.set(chunk.subarray(0, take), offset)
		offset += take
	}
	return new TextDecoder().decode(bytes)
}

export { compressedBytes, decompressHead }

// EOF
