import expandTarGz from "./targz.mjs"
import importedMemorySpec from "./wasm-memory.mjs"

function fnv1aHex(string) {
	let fnv1a32 = 0x811c9dc5;
	for (let i = 0; i < string.length; ++i) {
		let byte = string.charCodeAt(i);
		fnv1a32 = ((fnv1a32^byte)*0x1000193)|0;
	}
	return [24, 16, 8, 0].map(s => ((fnv1a32>>s)&0xFF).toString(16).padStart(2, "0")).join("");
}

export default async function getWclap(options) {
	if (typeof options === 'string') options = {url: options};
	options = Object.assign({}, options);
	if (!options.pluginPath) options.pluginPath = "/plugin/" + fnv1aHex(options.url || "");
	let maximumMemoryPages = options.maximumMemoryPages ?? 32768;

	function configureMemory(spec) {
		let memories = WebAssembly.Module.imports(options.module).filter(entry => entry.kind == 'memory');
		if (!memories.length) return;
		if (memories.length != 1) throw Error("WCLAP supports one imported memory");
		if (!spec) throw Error("A precompiled WCLAP module requires memorySpec from getWclap()");

		let maximum = Math.min(spec.maximum ?? maximumMemoryPages, maximumMemoryPages);
		if (spec.initial > maximum)
			throw new RangeError(`WCLAP memory minimum ${spec.initial} pages exceeds maximum ${maximum} pages`);

		options.memorySpec = {...spec, maximum};
		delete options.memory;
		// Only shared memory can be passed between the main thread and AudioWorklet.
		if (globalThis.crossOriginIsolated && spec.shared)
			options.memory = new WebAssembly.Memory(options.memorySpec);
	}

	if (options.module && options.module instanceof WebAssembly.Module) {
		configureMemory(options.memorySpec);
		// Distinct path suffix
		options.pluginPath += "-copy-" + fnv1aHex(Date.now() + (options.url || "") + Math.random());
		return options;
	}

	let prevFiles = options.files;
	options.files = {};
	if (prevFiles) {
		for (let key in prevFiles) { // Add the WCLAP's path prefix
			options.files[`${options.pluginPath}/${key}`] = prevFiles[key];
		}
	}

	let wasmPath = `${options.pluginPath}/module.wasm`;
	options.module = options.module || options.files[wasmPath];
	options.files[wasmPath] = new ArrayBuffer(0); // avoid self-parsing shenanigans

	if (options.module && (options.module instanceof ArrayBuffer || ArrayBuffer.isView(options.module))) {
		let buffer = ArrayBuffer.isView(options.module)
			? new Uint8Array(options.module.buffer, options.module.byteOffset, options.module.byteLength)
			: options.module;
		options.module = await WebAssembly.compile(buffer);
		configureMemory(importedMemorySpec(buffer));
		return options;
	}

	let response = await fetch(options.url);
	if (response.headers.get("Content-Type") == "application/wasm") {
		let [module, buffer] = await Promise.all([
			WebAssembly.compileStreaming(response.clone()), response.arrayBuffer()
		]);
		options.module = module;
		configureMemory(importedMemorySpec(buffer));
		return options;
	}

	// If it's not WASM, assume it's a `.tar.gz`
	let tarFiles = await expandTarGz(response);
	for (let path in tarFiles) {
		let normalizedPath = path.replace(/^(\.\/)+/, "");
		options.files[`${options.pluginPath}/${normalizedPath}`] = tarFiles[path];
	}
	if (!options.files[wasmPath] || !options.files[wasmPath].byteLength) {
		// Find first `module.wasm` in the bundle (in case it's not top-level)
		for (let path in tarFiles) {
			let normalizedPath = path.replace(/^(\.\/)+/, "");
			if (/(^|\/)module\.wasm$/.test(normalizedPath)) {
				console.error(`WCLAP bundle has WASM at ${path} instead of /module.wasm`);
				wasmPath = `${options.pluginPath}/${normalizedPath}`;
				break;
			}
		}
	}
	if (!options.files[wasmPath] || !options.files[wasmPath].byteLength) {
		throw Error("No `module.wasm` found in WCLAP bundle");
	}

	options.module = await WebAssembly.compile(options.files[wasmPath]);
	configureMemory(importedMemorySpec(options.files[wasmPath]));

	return options;
}
