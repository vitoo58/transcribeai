# TranscribeAI

AI-powered transcription platform for podcasts, meetings, and interviews. Bilingual (EN/ES).

## Quick Start

1. Clone the repo
2. Open `index.html` in a browser
3. Or serve locally: `python -m http.server 8000`

## Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create transcribeai --public --source=. --push
gh repo edit transcribeai --enable-pages --pages-source=main
```

## Features

- Bilingual EN/ES toggle
- Dark/Light theme
- Audio upload with drag & drop
- Price calculator
- Order tracking
- Responsive design
- Glassmorphism UI

## Tech Stack

- HTML5 + Tailwind CSS
- Vanilla JavaScript
- Formspree (form handling)
- GitHub Pages (hosting)