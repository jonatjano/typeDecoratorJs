export function assert(test, message = undefined) {
	if (! test) {
		throw new Error("assert error" + (message ?? ""))
	}
}

export function assertThrow(test, message = undefined) {
	const error = (() => {
		try {
			test()
			return undefined
		} catch (e) {
			return e
		}
	})()
	return assert(error !== undefined, "expected to throw, " + (message ?? ""))
}
