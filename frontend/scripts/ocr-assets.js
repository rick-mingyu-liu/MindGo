#!/usr/bin/env node
/**
 * Puts the files on-device OCR needs where this site serves them:
 *
 *   public/models/  the OCR model, downloaded once and checked against SHA-256
 *   public/ort/     ONNX Runtime's WASM, copied from node_modules
 *
 * Both directories are gitignored. Runs before `dev` and `build`, and is quick
 * when the files are already in place, because it checks hashes before
 * downloading anything.
 *
 * The model files come from a pinned commit of the Hugging Face mirror that
 * ppu-paddle-ocr itself uses. A changed file fails the build rather than
 * silently changing what the benchmark measured. To move to another model,
 * change lib/ocr/profile.json and the entries below together, then re-run
 * the benchmark in eval/.
 *
 * Run: npm run ocr-assets
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'public', 'models');
const ORT_DIR = path.join(ROOT, 'public', 'ort');
const ORT_DIST = path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
const BASE = 'https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/bf1d5edb0335d3262be7caf13f766ba274b4cadd';

const MODELS = [
  {
    file: 'PP-OCRv6_small_det.ort',
    url: `${BASE}/detection/ort/PP-OCRv6_small_det.ort`,
    sha256: 'c21be8d8268f0f45e2693b1d52432a290a56d008f6c1ff28b4baa7c35bab250e',
  },
  {
    file: 'PP-OCRv6_small_rec.ort',
    url: `${BASE}/recognition/ort/PP-OCRv6_small_rec.ort`,
    sha256: '40bccd9fa3ae2d14d724bf9d020c8f0edfc801489477b92f7449162a538366df',
  },
  {
    file: 'ppocrv6_dict.txt',
    url: `${BASE}/recognition/ppocrv6_dict.txt`,
    sha256: '41557512862dfe31970cf22407742b629725461dd84c0d8771bde9c87c2202c8',
  },
];

// The classic-script runtime (see lib/ocr/ortRuntime.js) and the plain WASM
// build it loads; the worker uses the 'wasm' provider only.
const ORT_FILES = ['ort.wasm.min.js', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

async function ensureModel({ file, url, sha256: expected }) {
  const target = path.join(MODELS_DIR, file);
  if (fs.existsSync(target) && sha256(fs.readFileSync(target)) === expected) return 'present';

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status} from ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const actual = sha256(buffer);
  if (actual !== expected) {
    throw new Error(`${file}: checksum mismatch (expected ${expected}, got ${actual}). Not writing it.`);
  }
  fs.writeFileSync(target, buffer);
  return 'downloaded';
}

async function main() {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.mkdirSync(ORT_DIR, { recursive: true });

  for (const model of MODELS) {
    console.log(`ocr-assets: ${model.file} ${await ensureModel(model)}`);
  }
  for (const file of ORT_FILES) {
    const source = path.join(ORT_DIST, file);
    if (!fs.existsSync(source)) throw new Error(`${source} is missing — is onnxruntime-web installed?`);
    fs.copyFileSync(source, path.join(ORT_DIR, file));
  }
  console.log(`ocr-assets: copied ${ORT_FILES.length} runtime files`);
}

main().catch((error) => {
  console.error(`✖ ocr-assets: ${error.message}`);
  process.exit(1);
});
