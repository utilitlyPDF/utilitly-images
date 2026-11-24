// The one engine file that uses Node.js APIs: it reads the codecs' .wasm files
// from wherever npm installed them, because Node can't fetch a file URL.

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { WasmSource } from './wasm'

// Node has the WebAssembly global, but only the DOM lib declares it.
declare const WebAssembly: { compile(bytes: Uint8Array): Promise<unknown> }

const resolver = createRequire(import.meta.url)

export const nodeWasmSource: WasmSource = async file => WebAssembly.compile(await readFile(resolver.resolve(file)))
