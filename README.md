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
- Live price calculator (rate depends on delivery time)
- Order system: generates a unique order ID, stores the order locally
- Order tracking timeline (received → processing → ready)
- Transcript download in TXT, DOCX, and SRT formats
- Responsive glassmorphism UI

## Tech Stack

- HTML5 + Tailwind CSS (CDN)
- Vanilla JavaScript (transpiled for all modern browsers)
- JSZip (CDN) for DOCX generation
- localStorage (order persistence — demo only)
- GitHub Pages (hosting)

## Notes

Orders are stored in the browser's `localStorage` (no backend yet). The transcript
generated on download is a preview sample. Replace the `generateTranscript` function
in `js/tracker.js` to wire up a real transcription backend.

## Deploy

The GitHub Pages workflow is:

```bash
git push origin main
```

Pages build from the `main` branch, root folder.