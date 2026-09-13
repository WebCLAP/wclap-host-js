// Read only after WebAssembly.compile() has validated the module.
export default function importedMemorySpec(source) {
	let bytes = ArrayBuffer.isView(source)
		? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
		: new Uint8Array(source);
	let position = 8;
	let end = bytes.length;

	function byte() {
		if (position >= end) throw Error("Unexpected end of Wasm memory declaration");
		return bytes[position++];
	}

	function uint() {
		let value = 0;
		for (let shift = 0; shift < 35; shift += 7) {
			let b = byte();
			value += (b & 127)*2**shift;
			if (!(b & 128)) return value;
		}
		throw Error("Unsupported Wasm integer");
	}

	function skipName() {
		let length = uint();
		position += length;
		if (position > end) throw Error("Invalid Wasm import name");
	}

	function skipReferenceType() {
		let type = byte();
		if (type == 0x63 || type == 0x64) uint();
	}

	function limits() {
		let flags = uint();
		if (flags & ~3) throw Error("Only wasm32 memory and table limits are supported");
		let initial = uint();
		let maximum = flags & 1 ? uint() : undefined;
		return {initial, maximum, shared: !!(flags & 2)};
	}

	while (position < end) {
		let id = byte();
		let size = uint();
		let sectionEnd = position + size;
		if (sectionEnd > end) throw Error("Invalid Wasm section size");
		if (id != 2) {
			position = sectionEnd;
			continue;
		}

		end = sectionEnd;
		let count = uint();
		for (let i = 0; i < count; ++i) {
			skipName();
			skipName();
			switch (byte()) {
				case 0: uint(); break;
				case 1: skipReferenceType(); limits(); break;
				case 2: return limits();
				case 3: skipReferenceType(); byte(); break;
				case 4: uint(); uint(); break;
				default: throw Error("Unsupported Wasm import kind");
			}
		}
		return;
	}
}
