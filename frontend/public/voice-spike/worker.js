// Voice dictation SPIKE (docs/VOICE.md). Not production code; delete before the build.
//
// A module worker served as a static file, so webpack never sees it and OCR's
// `onnxruntime-web$` alias (next.config.js) is untouched. Transformers.js's
// self-contained build carries its own ONNX Runtime (1.31-dev) and fetches
// its .wasm from the same CDN; OCR keeps 1.30.0 from /ort/.
import { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, Tensor, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js'

env.allowLocalModels = false

// Amounts kept as words, lowercase, no punctuation (round 2's best, "w2":
// 58/60 amount-usable). Round 1's digits prompt, "Pizza at Domino's $18.25.
// Parking $7.50 yesterday. Paid $1,200 rent. Sobeys $43.06 today.", made
// Whisper squash "twenty three forty" into 2340. transformers.js 4.3.1 ignores
// generate({prompt_ids}), so the prompt goes in as decoder input. Merchants
// here are deliberately not ones the spike phrases use.
const PROMPT = "pizza at dominos eighteen twenty five parking seven fifty yesterday paid twelve hundred rent sobeys forty three oh six today"

let loaded = null

async function load({ model, device, quant }) {
  const id = `onnx-community/whisper-${model}`
  const files = new Map()
  const progress_callback = p => {
    if (p.status === 'progress' || p.status === 'done') {
      files.set(p.file, { loaded: p.loaded ?? p.total ?? 0, total: p.total ?? 0 })
      let l = 0, t = 0
      for (const f of files.values()) { l += f.loaded; t += f.total }
      postMessage({ type: 'progress', loaded: l, total: t })
    }
  }
  const started = performance.now()
  // q8 is the small download (tiny 41 MB, base 77 MB); WebGPU's usual fp32 + q4 is 120 / 206 MB.
  const dtype = quant === 'fp32+q4' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8'
  const [processor, tokenizer, net] = await Promise.all([
    AutoProcessor.from_pretrained(id, { progress_callback }),
    AutoTokenizer.from_pretrained(id, { progress_callback }),
    WhisperForConditionalGeneration.from_pretrained(id, { dtype, device, progress_callback }),
  ])
  const prompt = [tokenizer.convert_tokens_to_ids('<|startofprev|>'), ...tokenizer.encode(' ' + PROMPT, { add_special_tokens: false })]
  const start = [tokenizer.convert_tokens_to_ids('<|startoftranscript|>'), tokenizer.convert_tokens_to_ids('<|notimestamps|>')]
  let bytes = 0
  for (const f of files.values()) bytes += f.total
  loaded = { model, device, processor, tokenizer, net, prompt, start }
  return { loadMs: Math.round(performance.now() - started), bytes }
}

// promptText (round 2) overrides PROMPT for one clip, so the harness can compare prompts without reloading.
async function transcribe({ audio, primed, promptText }) {
  const { processor, tokenizer, net, start } = loaded
  const prompt = promptText ? [tokenizer.convert_tokens_to_ids('<|startofprev|>'), ...tokenizer.encode(' ' + promptText, { add_special_tokens: false })] : loaded.prompt
  const t0 = performance.now()
  const { input_features } = await processor(audio)
  const ids = primed ? [...prompt, ...start] : start
  const decoder_input_ids = new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length])
  const out = await net.generate({ inputs: input_features, decoder_input_ids, max_new_tokens: 96 })
  const text = tokenizer.batch_decode(out.slice(null, [ids.length, null]), { skip_special_tokens: true })[0].trim()
  return { text, ms: Math.round(performance.now() - t0) }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') postMessage({ type: 'ready', id: data.id, ...(await load(data)) })
    else postMessage({ type: 'result', id: data.id, ...(await transcribe(data)) })
  } catch (error) {
    postMessage({ type: 'error', id: data.id, message: String(error?.message ?? error).slice(0, 300) })
  }
}
