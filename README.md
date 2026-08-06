# TranscribeAI

AI-powered transcription platform for podcasts, meetings, and interviews. Bilingual (EN/ES).

Live: [https://vitoo58.github.io/transcribeai/](https://vitoo58.github.io/transcribeai/)

## Quick Start

1. Clone the repo
2. Open `index.html` in a browser
3. Or serve locally: `python -m http.server 8000`

## Pages

- `index.html` — Landing page with full upload flow
- `upload.html` — Standalone upload flow (drop zone, calculator, submit)
- `track.html` — Order tracking + transcript download

## Features

- Bilingual EN/ES toggle (persisted)
- Dark/Light theme (persisted)
- Audio upload with drag & drop (MP3, WAV, M4A, OGG, FLAC) + real duration detection
- **Free, on-device transcription** with Whisper via `transformers.js` (no backend, no API cost)
- Live price calculator (rate depends on delivery time)
- Order system: generates a unique order ID, stores the order locally
- Order tracking timeline (received → processing → ready)
- Transcript download in TXT, DOCX, and SRT formats
- Responsive glassmorphism UI

## How transcription works (free, no API)

`js/whisper.js` runs a Whisper model (`Xenova/whisper-tiny` or `whisper-base`) directly in
the user's browser using WebAssembly (transformers.js). Audio is decoded natively with the
browser's `AudioContext.decodeAudioData` (no ffmpeg needed, works on GitHub Pages without
SharedArrayBuffer). No API keys, no servers, no cost — the model is downloaded once from a
CDN and cached in the browser. It supports EN and ES out of the box.

## Tech Stack

- HTML5 + Tailwind CSS (CDN)
- Vanilla JavaScript (ES6+)
- `transformers.js` (on-device Whisper transcription, no backend)
- JSZip (CDN) for DOCX export
- localStorage (order persistence — demo only)
- GitHub Pages (hosting)

## Notes

Orders are stored in the browser's `localStorage` (no backend yet). The transcript is
generated on-device by Whisper in the browser — real text, no preview placeholder.

## Deploy

The GitHub Pages workflow is:

```bash
git push origin main
```

Pages build from the `main` branch, root folder.