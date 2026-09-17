/**
 * On-device OCR. Runs in a Web Worker so that inference never blocks the page.
 *
 * Everything it loads is served by this site: the model files from
 * /models/ (scripts/ocr-assets.js puts them there, checksummed) and the ONNX
 * Runtime WASM from /ort/. The screenshot itself never leaves the device —
 * only the recognised lines are posted back to the page.
 *
 * The settings come from profile.json, which the benchmark in eval/ also
 * reads, so the browser runs exactly the configuration that was measured.
 */
import { env } from 'onnxruntime-web'
import { PaddleOcrService, type FlattenedPaddleOcrResult } from 'ppu-paddle-ocr/web'
import profile from './profile.json'
import type { WorkerRequest, WorkerResponse } from './types'

env.wasm.wasmPaths = '/ort/'
// One thread. Multi-threaded WASM needs a cross-origin isolated page, and even
// on one, this classic-script runtime hangs starting its thread workers
// (measured 2026-09-16). Pinned so that isolating the page later cannot
// silently switch to the path that hangs.
env.wasm.numThreads = 1

const post = (message: WorkerResponse) => self.postMessage(message)

let ready: Promise<PaddleOcrService> | null = null

/** Fetches the model files ourselves, so the page can show real progress. */
async function fetchModels() {
  const names = [profile.files.detection, profile.files.recognition, profile.files.charactersDictionary]
  const responses = await Promise.all(names.map(async (name) => {
    const res = await fetch(`/models/${name}`)
    if (!res.ok || !res.body) throw new Error(`could not load /models/${name} (${res.status})`)
    return res
  }))
  const total = responses.reduce((sum, res) => sum + Number(res.headers.get('content-length') || 0), 0)
  let loaded = 0
  const buffers = await Promise.all(responses.map(async (res) => {
    const reader = res.body!.getReader()
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      post({ type: 'progress', loaded, total })
    }
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
    let offset = 0
    for (const chunk of chunks) {
      out.set(chunk, offset)
      offset += chunk.byteLength
    }
    return out.buffer
  }))
  return { detection: buffers[0], recognition: buffers[1], charactersDictionary: buffers[2] }
}

function service(): Promise<PaddleOcrService> {
  if (!ready) {
    ready = (async () => {
      const model = await fetchModels()
      const ocr = new PaddleOcrService({
        model,
        processing: { engine: profile.engine as 'opencv' | 'canvas-native' },
        session: { executionProviders: ['wasm'] },
      })
      await ocr.initialize()
      return ocr
    })()
    // A failed load must not be cached: the next attempt starts over.
    ready.catch(() => { ready = null })
  }
  return ready
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  try {
    const ocr = await service()
    if (message.type === 'init') {
      post({ type: 'ready' })
      return
    }
    const started = performance.now()
    const result = (await ocr.recognize(message.buffer, {
      flatten: true,
      strategy: profile.strategy as 'per-box' | 'per-line',
      minimumConfidence: 0,
    })) as FlattenedPaddleOcrResult
    post({
      type: 'result',
      id: message.id,
      lines: result.results.map((r) => ({ text: r.text, conf: r.confidence, box: r.box })),
      image: { width: message.width, height: message.height },
      model: profile.name,
      durationMs: Math.round(performance.now() - started),
    })
  } catch (error) {
    post({
      type: 'error',
      id: message.type === 'recognize' ? message.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
