/* global importScripts */
/**
 * onnxruntime-web, loaded at runtime from /ort/ instead of being bundled.
 *
 * next.config.js points every `import ... from 'onnxruntime-web'` at this file.
 * The package's ES module builds refer to themselves through import.meta.url,
 * which webpack turns into a separate .mjs asset that Next's minifier cannot
 * parse, and the build fails. Its classic-script WASM-only build has no such reference:
 * loaded with importScripts it defines a global `ort`, and this module
 * re-exports the three members ppu-paddle-ocr uses.
 *
 * Worker-only: importScripts does not exist on a page. scripts/ocr-assets.js
 * copies the runtime files into public/ort/.
 */
importScripts('/ort/ort.wasm.min.js');

const runtime = self.ort;

export const env = runtime.env;
export const InferenceSession = runtime.InferenceSession;
export const Tensor = runtime.Tensor;
export default runtime;
