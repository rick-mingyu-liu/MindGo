/** One piece of recognised text, in the original image's pixels. */
export interface OcrLine {
  text: string
  conf: number
  box: { x: number; y: number; width: number; height: number }
}

/** What reading one screenshot produces, and what POST /import/parse takes. */
export interface OcrOutput {
  lines: OcrLine[]
  image: { width: number; height: number }
  model: string
  durationMs: number
}

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'recognize'; id: number; buffer: ArrayBuffer; width: number; height: number }

export type WorkerResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | ({ type: 'result'; id: number } & OcrOutput)
  | { type: 'error'; id?: number; message: string }
