# Voice dictation — design and handoff

Status: **spike run on a laptop, 2026-10-15; result is no-go on accuracy as measured, phone and iOS pending** (see [Spike results](#spike-results-2026-10-15)). Draft PR #86. This file is written so that another session can pick the work up cold. Read [`CLAUDE.md`](../CLAUDE.md) (Conversation recording, On-device OCR) and [`PHASE-2.md`](PHASE-2.md) section C first.

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

## Spike results (2026-10-15)

Measured on an Apple-silicon MacBook in Chrome 155. The harness was the spike page `/voice-spike` (`frontend/pages/voice-spike.tsx` and `public/voice-spike/worker.js`: unlinked, noindex, to be deleted before the build) plus scripts kept outside the repo.

**Verdict: no-go for the mic button as specified.** Laptop latency passes easily. Amount accuracy misses the 18/20 bar on every configuration: the best is 17/20. The phone and iOS Safari are not measured yet. Two caveats cut in opposite directions: the phrases were spoken by macOS text-to-speech voices, not the owner, and a real voice may do better or worse; and some failures are systematic (below), which no voice fixes.

### 1. Runtime: a separate copy works, and OCR is untouched

- The worker is a module worker served as a static file (`/voice-spike/worker.js`), so webpack never sees it. It imports Transformers.js 4.3.1's self-contained build `dist/transformers.min.js`, which bundles its own ONNX Runtime **1.31.0-dev**. That build fetches its runtime file from the same CDN: `ort-wasm-simd-threaded.asyncify.wasm`, 5.5 MB. OCR keeps 1.30.0 from `/ort/`, and `next.config.js`, `lib/ocr/` and the frontend's dependencies are unchanged.
- **OCR import still works.** In one Chrome session I loaded the voice model, then imported `eval/synthetic/bank-balance-01.png` on the real `/import` page against a local backend on the compose database. It read in 1.3 s, with all 5 rows and the 103.64 row correct.
- `next build`, lint and `check:locales` pass.
- whisper.cpp was not needed.
- For the real build: self-host `transformers.min.js` and its `.wasm` under `public/voice/`, pinned and checksummed like `scripts/ocr-assets.js`, rather than importing from jsDelivr as the spike does.

### 2. Accuracy: Whisper squashes dollars and cents

There were 20 phrases, all fictional, each spoken by 3 voices (en-US Samantha, en-GB Daniel, en-AU Karen), so 60 clips. "Amount right" means the transcript keeps the amount usable: `23.40`, `23 40` or words, but not `2340`.

| Model (8-bit unless noted) | Amount right | Per voice (of 20) |
| --- | --- | --- |
| `tiny.en` | 30/60 | 11, 10, 9 |
| `base.en` | 42/60 | 15, 14, 13 |
| `tiny.en`, amount prompt | 44/60 | 14, 15, 15 |
| **`base.en`, amount prompt** | **49/60** | **17, 16, 16** |
| `base.en` fp32 encoder + q4 decoder, amount prompt | 44/60 | 16, 15, 13 |

- Dates ("yesterday", "today", "last night") were right in every clip.
- Merchant words were right in 53/60 for `base.en`. The misses: "Launch" for lunch, "No Freel", "Best by", "Shop is drug mark".
- **The main failure is systematic.** When dollars and cents are said without "dollars", Whisper writes them as one integer: "uber twenty three forty" → `Uber 2340`, "netflix sixteen ninety nine" → `Netflix 1699`, "nine fifty" → `950`. When the speaker says "dollars" ("fifteen dollars", "eighty four dollars and twenty cents"), the amount comes out right. Some outright errors also appeared: "eighty nine ninety nine" → `1899`, and "twenty five us dollars" → `$25.00`, which loses the currency.
- **The amount prompt** puts example amounts written as `$18.25` before the transcript, so Whisper follows that format. It's worth +7 to +14 clips. Transformers.js 4.3.1 declares `generate({prompt_ids})` but ignores it, so the worker passes the prompt as `decoder_input_ids` instead (`<|startofprev|>` + prompt + `<|startoftranscript|><|notimestamps|>`). That works.
- **Pocky does not reliably repair squashed amounts.** Live on the direct runtime, 2 runs each:

  | Transcript | Pocky drafted |
  | --- | --- |
  | `Netflix 1699` | 16.99 |
  | `Uber 2340.` | 23.40, or asked |
  | `Spent 950 on bubble tea yesterday.` | **950.00** (both runs) |
  | `Shoppers Drug Mart 1249 today.` / `Gas at Petro Canada 5130` | asked for the amount, or failed |

  The only safeguards would be the editable transcript and the Confirm button.

### 3. Latency on the laptop (10.1-second clip, from audio to text in the worker)

| Model | Engine and files | 10 s clip (3 runs) | 3 s clip |
| --- | --- | --- | --- |
| `tiny.en` | WASM, 8-bit | 1.18–1.23 s | 1.0 s |
| `base.en` | WASM, 8-bit | 2.41–2.54 s | 2.2 s |
| `tiny.en` | WebGPU, fp32 + q4 | 0.30–0.80 s | 0.19 s |
| `base.en` | WebGPU, fp32 + q4 | 0.39–0.59 s | 0.24 s |
| `base.en` | WebGPU, 8-bit | 2.29–2.49 s | 1.8 s |

- Everything is well under 5 s.
- WASM ran single-threaded: the app isn't cross-origin isolated, the same constraint OCR has.
- WebGPU is only faster with the large fp32 + q4 files; with 8-bit files it's no faster than WASM.
- **Phone: not measured.**

### 4. Download size and caching

| Files | `tiny.en` | `base.en` |
| --- | --- | --- |
| 8-bit (WASM, or WebGPU with no speedup) | 40.8 MB | 76.9 MB |
| fp32 encoder + q4 decoder (fast WebGPU) | 119.6 MB | 206.1 MB |

- Add 5.5 MB for the runtime file. All of this is on top of OCR's ~45 MB.
- First load is 2.6–4.6 s on this connection with 8-bit files, and 9.5–12.3 s with the large WebGPU files.
- **A reload fetched 0 bytes of model** (Transformers.js keeps the files in Cache Storage), and loading from the cache took 0.5–0.8 s.

### 5. iOS Safari: not measured

This needs a real device. Open `/voice-spike` on the PR's Vercel preview on an iPhone, load `base.en` (WASM), record an entry, and note:

- the reported `audio/mp4` type
- whether decoding and resampling succeed
- the "stop → text" time
- the same time on one mid-range Android phone

### What would change the verdict

1. **Run it on the owner's voice** (the 20 phrases above, on `/voice-spike`). If amounts reach 18/20 with the prompt, the bar is met.
2. **Speak amounts with "dollars"** ("nine dollars fifty"). It's reliable in every clip, but it puts the burden on the user.
3. **Compare the phone keyboard's dictation** with the same phrases. If it formats `$9.50` correctly, the interim (no feature) may be the answer.

Building the mic button anyway would mean relying on the user to catch `950` in the textarea and in the draft.

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

- `tiny.en` (smaller, faster) or `base.en` (more accurate) if both pass — decided by the spike numbers. *Spike: `base.en` 8-bit with the amount prompt is the most accurate (49/60), 2.5 s per 10 s clip on WASM; neither passes 18/20 on synthetic voices.*
- Self-host the model or use the Hugging Face CDN. *Spike: the 8-bit files are 41 MB / 77 MB and cache after the first load; self-hosting stays the recommendation, for the same pinning reasons as OCR.*
- Push-to-talk (hold) or tap to start / tap to stop. Tap is easier on phones; proposed default.
