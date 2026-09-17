import { useCallback, useEffect, useRef, useState } from 'react'
import type { OcrOutput, WorkerRequest, WorkerResponse } from './types'

export type OcrState =
  | { status: 'idle' }
  | { status: 'loading'; loaded: number; total: number }
  | { status: 'ready' }
  | { status: 'unsupported' }
  | { status: 'failed'; message: string }

type Pending = { resolve: (output: OcrOutput) => void; reject: (error: Error) => void }

/**
 * The OCR worker, as a hook. The worker is created when the component mounts
 * and terminated when it unmounts, so the model occupies memory only while
 * the import page is open.
 *
 * `recognize` may be called before the model has loaded; calls wait for it and
 * run one at a time.
 */
export function useOcr() {
  const [state, setState] = useState<OcrState>({ status: 'idle' })
  const worker = useRef<Worker | null>(null)
  const pending = useRef(new Map<number, Pending>())
  const nextId = useRef(1)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const start = useCallback(() => {
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      setState({ status: 'unsupported' })
      return
    }
    worker.current?.terminate()
    const w = new Worker(new URL('./ocr.worker.ts', import.meta.url))
    worker.current = w
    setState({ status: 'loading', loaded: 0, total: 0 })

    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        setState({ status: 'loading', loaded: message.loaded, total: message.total })
      } else if (message.type === 'ready') {
        setState({ status: 'ready' })
      } else if (message.type === 'result') {
        const { type: _type, id, ...output } = message
        pending.current.get(id)?.resolve(output)
        pending.current.delete(id)
      } else if (message.type === 'error') {
        if (message.id === undefined) {
          setState({ status: 'failed', message: message.message })
        } else {
          pending.current.get(message.id)?.reject(new Error(message.message))
          pending.current.delete(message.id)
        }
      }
    }
    w.onerror = (event) => setState({ status: 'failed', message: event.message || 'The reading engine stopped.' })
    w.postMessage({ type: 'init' } satisfies WorkerRequest)
  }, [])

  useEffect(() => {
    start()
    const waiting = pending.current
    return () => {
      worker.current?.terminate()
      worker.current = null
      for (const { reject } of waiting.values()) reject(new Error('The import page was closed.'))
      waiting.clear()
    }
  }, [start])

  const recognize = useCallback((file: File): Promise<OcrOutput> => {
    const run = async () => {
      const w = worker.current
      if (!w) throw new Error('The reading engine is not running.')
      const bitmap = await createImageBitmap(file)
      const { width, height } = bitmap
      bitmap.close()
      const buffer = await file.arrayBuffer()
      const id = nextId.current++
      return new Promise<OcrOutput>((resolve, reject) => {
        pending.current.set(id, { resolve, reject })
        w.postMessage({ type: 'recognize', id, buffer, width, height } satisfies WorkerRequest, [buffer])
      })
    }
    const result = queue.current.then(run, run)
    queue.current = result.catch(() => undefined)
    return result
  }, [])

  return { state, recognize, retry: start }
}
