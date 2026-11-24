// What Node.js gets: the same API, with the codecs loading their .wasm files
// from disk, since Node can't fetch them the way a browser does.
import { setWasmSource } from '../../../internal/wasm'
import { nodeWasmSource } from '../../../internal/node'

setWasmSource(nodeWasmSource)

export * from './index'
