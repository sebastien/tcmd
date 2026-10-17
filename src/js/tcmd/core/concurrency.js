// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-18

// Module: tcmd/core/concurrency
// Bounded async helpers. Both filesystem adapters list a directory by statting
// every entry; doing that one await at a time starves the host's threadpool, so
// each issues a bounded window of requests concurrently instead. `mapLimit`
// bounds one pass; `createLimiter` bounds a recursive walk, where the fan-out
// at each level would otherwise multiply. Pure, so the browser bundle can share
// them with the Node adapter.

// Function: mapLimit
// `map` over `items` with at most `limit` mappers in flight, preserving order.
async function mapLimit(items, limit, mapper) {
	const result = new Array(items.length)
	let next = 0
	const worker = async () => {
		while (next < items.length) {
			const index = next++
			result[index] = await mapper(items[index], index)
		}
	}
	const workers = []
	for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker())
	await Promise.all(workers)
	return result
}

// Function: createLimiter
// Wraps calls so at most `limit` run concurrently, queueing the rest. Unlike
// `mapLimit`, every call shares one global slot, so a recursive walk can bound
// its total in-flight work rather than multiplying the limit per level.
function createLimiter(limit) {
	let active = 0
	const queue = []
	const pump = () => {
		if (active >= limit || queue.length === 0) return
		active += 1
		const { fn, resolve, reject } = queue.shift()
		Promise.resolve()
			.then(fn)
			.then(resolve, reject)
			.finally(() => {
				active -= 1
				pump()
			})
	}
	return (fn) =>
		new Promise((resolve, reject) => {
			queue.push({ fn, resolve, reject })
			pump()
		})
}

export { createLimiter, mapLimit }

// EOF
