// Copyright 2024 The Matrix.org Foundation C.I.C.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @ts-check

/**
 * This is the entrypoint on non-node ESM environments.
 * `asyncLoad` will load the WASM module using a `fetch` call.
 */

import * as bindings from "./pkg/matrix_sdk_crypto_wasm_bg.js";

const defaultURL = new URL("./pkg/matrix_sdk_crypto_wasm_bg.wasm", import.meta.url);

// Although we could simply instantiate the WASM at import time with a top-level `await`,
// we avoid that, to make it easier for callers to delay loading the WASM (and instead
// wait until `initAsync` is called). (Also, Safari 14 doesn't support top-level `await`.)
//
// However, having done so, there is no way to synchronously load the WASM if the user ends
// up using the bindings before calling `initAsync` (unlike under Node.js), so we just throw
// an error.
bindings.__wbg_set_wasm(
    new Proxy(
        {},
        {
            get() {
                throw new Error(
                    "@matrix-org/matrix-sdk-crypto-wasm was used before it was initialized. Call `initAsync` first.",
                );
            },
        },
    ),
);

/**
 * Stores a promise of the `loadModuleAsync` call
 * @type {Promise<void> | null}
 */
let modPromise = null;

/**
 * Loads and instantiates the WASM module asynchronously
 *
 * @param {URL | string} url - The URL to fetch the WebAssembly module from
 * @returns {Promise<void>}
 */
async function loadModuleAsync(url) {
    const imports = {
        // @ts-expect-error: The bindings don't exactly match the 'ExportValue' type
        "./matrix_sdk_crypto_wasm_bg.js": bindings,
    };

    let instance;
    // Bevorzugt Streaming-Instanziierung – schnellste Variante. Sie verlangt
    // aber exakt Content-Type "application/wasm". Manche Server, Proxys oder
    // Safari-Versionen liefern das nicht, dann wirft instantiateStreaming.
    // MatrixMess-Fix: In diesem Fall (oder wenn die API fehlt) über
    // arrayBuffer() ausweichen – funktioniert unabhängig vom MIME-Typ.
    try {
        if (typeof WebAssembly.instantiateStreaming === "function") {
            const result = await WebAssembly.instantiateStreaming(fetch(url), imports);
            instance = result.instance;
        } else {
            throw new Error("instantiateStreaming nicht verfügbar");
        }
    } catch (streamErr) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("WASM HTTP " + resp.status);
            const bytes = await resp.arrayBuffer();
            const result = await WebAssembly.instantiate(bytes, imports);
            instance = result.instance;
        } catch (fallbackErr) {
            // Beide Wege gescheitert: Ursache klar weitergeben.
            const msg = (fallbackErr && fallbackErr.message) || String(fallbackErr);
            throw new Error("WASM konnte nicht geladen werden: " + msg);
        }
    }

    bindings.__wbg_set_wasm(instance.exports);
    // @ts-expect-error: Typescript doesn't know what the module exports are
    instance.exports.__wbindgen_start();
}

/**
 * Load the WebAssembly module in the background, if it has not already been loaded.
 *
 * Returns a promise which will resolve once the other methods are ready.
 *
 * @param {URL | string} [url] - The URL to fetch the WebAssembly module from. If not provided, a default URL will be used.
 * @returns {Promise<void>}
 */
export async function initAsync(url = defaultURL) {
    if (!modPromise) modPromise = loadModuleAsync(url);
    try {
        await modPromise;
    } catch (err) {
        // MatrixMess-Fix: Eine gescheiterte Ladung darf nicht dauerhaft
        // zwischengespeichert bleiben – sonst würde jeder "erneut laden"-
        // Versuch sofort dieselbe Rejection liefern. Zurücksetzen, damit
        // der nächste initAsync() wirklich neu lädt.
        modPromise = null;
        throw err;
    }
}

// Re-export everything from the generated javascript wrappers
export * from "./pkg/matrix_sdk_crypto_wasm_bg.js";
