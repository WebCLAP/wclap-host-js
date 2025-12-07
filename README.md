# `wclap-js`: use WCLAPs in the browser

The cleanest way to interact with WCLAPs in the browser is to write a C++ WASM host, which then exposes a simpler API to JS.  This keeps all the CLAP-specific structures in the "native" world.

## C++ library

The `cpp/` subdirectory provides `wclap-js-instance`(a `.h`/`.cpp` pair) for building the native side of your WCLAP host.

It provides an `Instance` implementation (as defined in [`wclap-cpp`](https://github.com/WebCLAP/wclap-cpp)) which abstracts all the WCLAP interactions (e.g. calling WCLAP functions, reading/writing structures in its memory).

## JS library

It also provides a JavaScript library (ES6 module: `wclap-js/wclap.mjs`) which can load any WASM hosts written using the above C++ library, and handles the corresponding `WebAssembly` instances.

All functions are asynchronous aside from `host.getWorkerData()` and the two `.initObj()` methods.  The top-level exported functions are:

* `getHost()` / `getWclap()` - takes a URL and returns an "initialisation object" (including a compiled WebAssembly module) for the host or a WCLAP module
* `startHost(initObj, ?hostImports, ?createWorker)` - takes the initialisation object and (if supported) a function to create new `Worker`s, and returns a Host.
* `runThread(threadData, hostImports, createWorker)` - to be called from any `Worker`s that you start

![wclap-js architecture diagram](doc/wclap-js-outline.png)

### Host

This is the object returned from `startHost()`.  It has the following properties/methods:

* `.hostInstance` - the actual `WebAssembly.Instance`.  Any custom exports from your C++ will be in `.hostInstance.exports`. 
* `.hostMemory` - hosts's memory, whether imported or exported 
* `.startWclap(wclapInit, ?createWorker)` - takes an initialisation object and returns a Wclap
* `.getWorkerData()` - see `createWorker()` below
* `.shared` - whether this host (currently) supports threads
* `.initObj()` - an initialisation object which can be passed across `Worker`s to create a matching `Host`.  If cross-origin isolated, this will join the existing host as a new thread.

### Wclap

This is the object returned from `host.startWclap()`.  It has the following properties/methods:

* `.ptr` - this corresponds to the `Instance *` in the host's C++ side 
* `.memory` - the WCLAP instance's memory
* `.shared` - whether this WCLAP supports threads
* `.initObj()` - an initialisation object which can be passed across `Worker`s to create a matching Wclap.  If cross-origin isolated, this will join as a new thread.

### `createWorker(host, threadData)`

This function (supplied either when starting the host, or the Wclap) is called when the Wclap wants to start a new thread.  It must (synchronously) return a `true`-ish value if successful.

The `threadData` doesn't contain any shared memory or modules, which means it can be passed back from the `AudioWorklet` (which is otherwise quite restricted).

To get the data which should actually be passed to the new `Worker`, call `host.getWorkerData(threadData)`.  On the new `Worker`, this should be passed to `runThread()`.
