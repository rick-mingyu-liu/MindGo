// Voice dictation SPIKE (docs/VOICE.md): measures on-device Whisper in this
// browser. Not a feature: unlinked, English only, noindex. Delete before the
// mic button is built. Audio stays in this tab; nothing is uploaded.
import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { Button } from '@/components/ui/button'

type Ready = { loadMs: number; bytes: number }
type Result = { text: string; ms: number }
type Reply = { type: 'progress'; loaded: number; total: number } | ({ type: 'ready'; id: number } & Ready) | ({ type: 'result'; id: number } & Result) | { type: 'error'; id: number; message: string }

const LIMIT_MS = 15_000

/** Decode a recording and resample it to 16 kHz mono, which Whisper expects. */
async function toWhisperInput(blob: Blob): Promise<Float32Array> {
  const decoded = await new AudioContext().decodeAudioData(await blob.arrayBuffer())
  const frames = Math.ceil(decoded.duration * 16_000)
  const offline = new OfflineAudioContext(1, frames, 16_000)
  const source = offline.createBufferSource()
  source.buffer = decoded; source.connect(offline.destination); source.start()
  return (await offline.startRendering()).getChannelData(0)
}

export default function VoiceSpike() {
  const worker = useRef<Worker | null>(null)
  const waiting = useRef(new Map<number, { resolve: (r: Reply) => void; reject: (e: Error) => void }>())
  const nextId = useRef(1)
  const [model, setModel] = useState<'tiny.en' | 'base.en'>('base.en')
  const [device, setDevice] = useState<'wasm' | 'webgpu'>('wasm')
  const [primed, setPrimed] = useState(true)
  const [log, setLog] = useState<string[]>([])
  const [progress, setProgress] = useState('')
  const [recording, setRecording] = useState(false)
  const [agent, setAgent] = useState('') // set after hydration: the server has no navigator
  useEffect(() => setAgent(navigator.userAgent), [])
  const recorder = useRef<MediaRecorder | null>(null)
  const note = (line: string) => setLog(l => [`${new Date().toLocaleTimeString()}  ${line}`, ...l])

  useEffect(() => {
    const w = new Worker('/voice-spike/worker.js', { type: 'module' })
    w.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (data.type === 'progress') { setProgress(`${(data.loaded / 1e6).toFixed(1)} / ${(data.total / 1e6).toFixed(1)} MB`); return }
      const entry = waiting.current.get(data.id); waiting.current.delete(data.id)
      if (data.type === 'error') entry?.reject(new Error(data.message)); else entry?.resolve(data)
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  const ask = (message: Record<string, unknown>, transfer: Transferable[] = []) => new Promise<Reply>((resolve, reject) => {
    const id = nextId.current++; waiting.current.set(id, { resolve, reject }); worker.current!.postMessage({ ...message, id }, transfer)
  })
  const load = async () => {
    const r = await ask({ type: 'load', model, device }) as Ready
    note(`loaded ${model} on ${device}: ${(r.bytes / 1e6).toFixed(1)} MB fetched in ${r.loadMs} ms`)
    return r
  }
  const transcribe = async (audio: Float32Array) => {
    const seconds = audio.length / 16_000 // read before the buffer is transferred
    const r = await ask({ type: 'transcribe', audio, primed }, [audio.buffer]) as Result
    note(`${seconds.toFixed(1)} s clip -> ${r.ms} ms in the worker: "${r.text}"`)
    return r
  }

  // For automated runs (the spike's browser harness): load, then transcribe a 16 kHz clip.
  useEffect(() => { (window as unknown as { __voiceSpike: unknown }).__voiceSpike = { load: (m: typeof model, d: typeof device, quant?: string) => ask({ type: 'load', model: m, device: d, quant }), transcribe: (a: Float32Array, p: boolean, promptText?: string) => ask({ type: 'transcribe', audio: a, primed: p, promptText }) } })

  const record = async () => {
    if (recording) { recorder.current?.stop(); return }
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (e) { note(`microphone refused: ${(e as Error).name}`); return }
    const r = new MediaRecorder(stream); const chunks: Blob[] = []; recorder.current = r
    r.ondataavailable = e => chunks.push(e.data)
    r.onstop = async () => {
      const released = performance.now()
      stream.getTracks().forEach(t => t.stop()); setRecording(false)
      const blob = new Blob(chunks, { type: r.mimeType })
      note(`recorded ${(blob.size / 1024).toFixed(0)} KB as ${r.mimeType || '(no type)'}`)
      try { await transcribe(await toWhisperInput(blob)); note(`stop -> text, decoding included: ${Math.round(performance.now() - released)} ms`) }
      catch (e) { note(`decode/transcribe failed: ${(e as Error).message}`) }
    }
    r.start(); setRecording(true); setTimeout(() => { if (r.state === 'recording') r.stop() }, LIMIT_MS)
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 text-sm">
      <Head><title>Voice spike</title><meta name="robots" content="noindex" /></Head>
      <h1 className="text-lg font-semibold">Voice dictation spike</h1>
      <p className="text-muted-foreground">Measures on-device speech-to-text in this browser. Audio never leaves the tab. Say an entry like “groceries at No Frills sixty two eighteen yesterday”.</p>
      <div className="flex flex-wrap items-center gap-3">
        <select value={model} onChange={e => setModel(e.target.value as typeof model)} className="rounded border bg-background p-1"><option>base.en</option><option>tiny.en</option></select>
        <select value={device} onChange={e => setDevice(e.target.value as typeof device)} className="rounded border bg-background p-1"><option>wasm</option><option>webgpu</option></select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={primed} onChange={e => setPrimed(e.target.checked)} />amount prompt</label>
        <Button variant="outline" onClick={() => load().catch(e => note(`load failed: ${e.message}`))}>Load model</Button>
        <Button onClick={record} aria-pressed={recording}>{recording ? 'Stop' : 'Record (max 15 s)'}</Button>
        <span className="text-muted-foreground">{progress}</span>
      </div>
      <p className="text-muted-foreground">{agent}</p>
      <pre className="whitespace-pre-wrap rounded border p-3">{log.join('\n') || 'Load a model, then record.'}</pre>
    </main>
  )
}

export async function getStaticProps({ locale }: { locale: string }) {
  return { props: { ...(await serverSideTranslations(locale, ['common'])) } }
}
