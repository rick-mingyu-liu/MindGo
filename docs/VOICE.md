# Voice dictation — design and handoff

Status: **not started** (draft PR, 2026-10-15). This file is written so that another session can pick the work up cold. Read [`CLAUDE.md`](../CLAUDE.md) (Conversation recording, On-device OCR) and [`PHASE-2.md`](PHASE-2.md) section C first.

## What we are building

A microphone button on `/agent` (Pocky). Hold or tap to record up to 15 seconds of **English** speech; it is transcribed **in the browser**, and the text is put into the message box. The user edits it and presses Send as usual.

- **English only** for now (owner's decision, 2026-10-15). Chinese and mixed speech are later work.
- **Audio never leaves the device.** No audio is uploaded, stored or logged. This matches screenshot import, and adds nothing to the privacy policy.
- **Nothing is sent automatically.** The transcript lands in the textarea; Send stays a deliberate click. Recording rules are unchanged: only the Confirm button saves transactions.
- **No backend change.** Pocky receives typed text, exactly as now.

Out of scope: a spoken, real-time voice agent (streaming audio to a provider, spoken replies); wake words; continuous listening.

## Interim, before any code

Phone keyboards (iOS, Android) and macOS dictation (Fn twice) already type speech into the message box. Use them during the week of real use and write down where they fail — garbled amounts, merchants, punctuation. Those notes become the spike's test phrases. If they turn out good enough, this feature can wait.

## Engine

| Option | Verdict |
| --- | --- |
| Whisper `tiny.en` / `base.en` via Transformers.js (`@huggingface/transformers`), quantized ONNX | **First choice.** English-only models are more accurate than the multilingual ones at the same size. Runs in a Web Worker on WASM, or WebGPU where available. |
| whisper.cpp compiled to WebAssembly | Fallback if Transformers.js cannot coexist with our ONNX Runtime setup (below). More build plumbing; no ONNX at all. |
| Browser Web Speech API | Rejected: Chrome sends audio to Google, Safari to Apple; no Firefox. |
| Hosted transcription (OpenAI, Deepgram, …) | Rejected: another data processor in the privacy policy, and another bill. |
| SenseVoice-Small via sherpa-onnx | Later, for Chinese and mixed speech. |

## Spike (1 day) — answer these before building

Record the answers in this file (a "Spike results" section) and in the PR.

1. **The `onnxruntime-web` alias.** `frontend/next.config.js` aliases `onnxruntime-web$` to `lib/ocr/ortRuntime.js`, which loads ONNX Runtime 1.30.0 from `/ort/` with `importScripts`, single-threaded, because Next's minifier cannot parse the library's ESM build. **Do not remove the alias** (OCR breaks). The alias will **not** catch Transformers.js. Checked against `@huggingface/transformers` 4.3.1 (2026-10-15):
   - It imports `onnxruntime-web/webgpu` and `onnxruntime-common`, not bare `onnxruntime-web`. The `$` in the alias matches only the bare name, so webpack would try to bundle the ESM build, which is the build Next's minifier cannot parse.
   - It pins `onnxruntime-web` `1.31.0-dev.20260914`, not our 1.30.0, so sharing our `/ort/` files means running it on an older runtime than it was built against.

   Try, in this order: (a) give the voice worker its own runtime copy, kept out of the bundle the way `ortRuntime.js` keeps OCR's, without widening the existing alias; (b) whisper.cpp built for WebAssembly, which needs no ONNX at all. Pointing Transformers.js at our `/ort/` 1.30.0 files via `env.backends.onnx` is the last resort, and only if it works with no version warnings. Whichever path is chosen, prove OCR import still works.
2. **Accuracy** on the owner's voice, 20 phrases taken from the interim notes, e.g. "lunch fifteen dollars", "uber twenty three forty", "groceries at No Frills 62.18 yesterday", "paid rent 1,150". Count phrases where the amount, merchant or date word is wrong. Compare `tiny.en` and `base.en`.
3. **Latency** for a 10-second clip, from releasing the button to text in the box: laptop (M-series, Chrome) and one mid-range phone, WASM single-threaded vs WebGPU. Also first-load time.
4. **Download size and caching.** Expect roughly 40 MB (`tiny.en`) to 80+ MB (`base.en`) quantized, on top of OCR's ~45 MB. Load only on first microphone use, with the OCR engine banner pattern, and confirm HTTP/Cache Storage keeps it to once per browser. Decide whether to self-host the model under `public/models/` (pinned and checksummed like `frontend/scripts/ocr-assets.js`) or fetch from the Hugging Face CDN; self-hosting is preferred for the same pinning reasons as OCR.
5. **iOS Safari.** `MediaRecorder` gives `audio/mp4`, not webm; confirm decode → 16 kHz mono `Float32Array` via `AudioContext.decodeAudioData` and resampling works there.

Go/no-go: proceed if a 10-second clip transcribes in under 5 s on the laptop with amounts right in at least 18 of 20 phrases, and the phone time is tolerable (record it either way).

## Build (2–3 days), if the spike passes

Follow the OCR code's shape; it solved the same problems.

- `frontend/lib/voice/voice.worker.ts` — loads the model, transcribes `Float32Array` 16 kHz mono, posts `progress` / `ready` / `result` / `error`. Model of: `lib/ocr/ocr.worker.ts`.
- `frontend/lib/voice/useVoice.ts` — hook owning the worker (created on first use, terminated on unmount), the state machine `idle → loading(loaded,total) → ready → recording → transcribing → ready | unsupported | denied | failed`, and a serial queue. Model of: `lib/ocr/useOcr.ts`.
- `frontend/lib/voice/record.ts` — `getUserMedia({audio:true})`, `MediaRecorder`, a hard 15-second stop, decode and resample, and **always stopping every track** afterwards so the browser's mic indicator goes off.
- `frontend/pages/agent.tsx` — a mic button beside the composer textarea (`composer` ref, `content` state, `maxLength={4000}`). The transcript is **inserted at the cursor or appended** to existing text, never replaces it; focus returns to the textarea. Disable the button whenever the textarea is disabled (`locked || unresolved || available !== true`) and while a run is pending.
- States the UI must show: model downloading (progress), recording (elapsed / 15 s), transcribing, mic permission denied (how to re-enable), unsupported browser, failure (try again / type instead). Keyboard-accessible, `aria-pressed` on the button, a visible recording indicator.
- Strings in both `frontend/public/locales/en/common.json` and `zh/common.json` (the UI is bilingual even though recognition is English-only); run `npm run check:locales`.
- Evaluation: add voice-style **text** cases to `backend/eval/` — what the transcriber actually produces (spelled-out numbers, "um", missing punctuation, "twenty three forty") — so Pocky's drafting is checked against transcripts. Cases stay fictional.
- Privacy: no audio or transcript in `localStorage`, logs or analytics; release the `MediaStream` on unmount and on page hide.

## Done when

- A spoken English entry becomes a correct draft in under 5 s on a laptop, end to end.
- The measured phone time is recorded here and in `STATUS.md`.
- Denied permission, unsupported browser and model-download failure each show a usable message, and typing still works.
- OCR import still works (the `onnxruntime-web` alias untouched or proven compatible).
- `npm run lint`, `npm run check:locales` and `npm run build` pass in `frontend/` (in a worktree, never the main checkout while its dev server runs); the backend eval passes with the new cases.
- Browser-checked on desktop and at 375 px, light and dark. The frontend has no test runner, so this is the verification.

## Open questions for the owner

- `tiny.en` (smaller, faster) or `base.en` (more accurate) if both pass — decided by the spike numbers.
- Self-host the model or use the Hugging Face CDN.
- Push-to-talk (hold) or tap to start / tap to stop. Tap is easier on phones; proposed default.
