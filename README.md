# DownFlick

> Paste any link. DownFlick detects the platform and downloads straight to your device.

A clean, fast, mobile-first universal media downloader. Paste a URL from
YouTube, TikTok, Instagram, Facebook, X/Twitter, Reddit, Vimeo, Twitch,
SoundCloud, Bilibili, Pinterest, Streamable, Imgur — or any of the 1,000+
sites that [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) supports — and DownFlick
extracts the available formats and streams the file straight to your browser.

---

## ✨ Features

- **One paste box.** No platform picker, no tabs, no clutter. Auto-detects the
  source as you type.
- **Mobile-first.** Touch-friendly tap targets, no iOS input zoom, GPU-friendly
  animations, respects `prefers-reduced-motion`.
- **Fast.** TikTok uses the TikWM API for direct CDN URLs (no transcoding).
  YouTube/etc. use `yt-dlp` with `ffmpeg` for HD merging + MP3 extraction.
- **Private.** No tracking, no analytics, no log of URLs. Temp files are
  deleted immediately after the response is sent.
- **Self-hostable.** Runs on Render.com, Fly.io, Railway, or any Docker host.

---

## 🚀 Quick start (local dev)

### Prerequisites

- Node.js 18+ (Node 20 LTS recommended)
- Python 3.9+ with `pip` (to install yt-dlp)
- ffmpeg (for MP3 extraction and HD video merging)

### One-command setup

```bash
git clone <your-fork> downflick
cd downflick
./setup.sh          # installs Node deps + yt-dlp + ffmpeg
bun run dev         # or: npm run dev
```

Then open http://localhost:3000.

### Manual setup

```bash
# Node deps
npm install

# yt-dlp
pip3 install --user yt-dlp

# ffmpeg
# macOS:    brew install ffmpeg
# Ubuntu:   sudo apt-get install -y ffmpeg
# Windows:  choco install ffmpeg

# Run
npm run dev
```

---

## ☁️ Deploy to Render.com

DownFlick ships with a `render.yaml` Blueprint and a production `Dockerfile`.

1. Push this repo to GitHub.
2. Go to https://dashboard.render.com/blueprints
3. Connect your repo. Render will read `render.yaml` and create the service.
4. Wait ~5 minutes for the first build (it installs ffmpeg + yt-dlp + Node deps).
5. Render assigns you a public URL like `https://downflick-xxxx.onrender.com`.

### What the Dockerfile does

- Uses `node:20-slim` as the base
- Installs `python3`, `ffmpeg`, `yt-dlp` system-wide
- Builds the Next.js standalone bundle
- Runs `node server.js` on port 3000 (configurable via `PORT` env var)
- Has a built-in healthcheck on `/`

### Deploy elsewhere (Fly.io, Railway, etc.)

Same Dockerfile works anywhere:

```bash
# Fly.io
fly launch --dockerfile Dockerfile
fly deploy

# Railway
railway up
```

---

## 🎯 How to use

1. Paste a link. You can also click the **paste icon** to pull from your clipboard.
2. DownFlick auto-detects the platform and shows a badge.
3. Press **Extract media** (or `⌘/Ctrl + Enter`).
4. A preview card shows thumbnail, title, uploader, and every available format.
5. Pick a format (4K MP4, 1080p MP4, MP3 audio, etc.).
6. Click **Download to device**. The file streams straight to your browser.

---

## 🏗 Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── extract/route.ts     POST {url} → metadata + format list
│   │   ├── download/route.ts   POST {url, formatId, audioOnly} → file
│   │   ├── stream/route.ts     GET ?url=... → proxy remote CDN URL
│   │   └── health/route.ts     GET → yt-dlp availability
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── downflick/
│   │   └── downflick-app.tsx    the entire React app (memoized sub-components)
│   └── ui/                      shadcn/ui components
└── lib/
    ├── platform.ts              URL → platform detector
    ├── yt-dlp.ts                yt-dlp subprocess wrapper
    └── tikwm.ts                 TikWM API client (TikTok fast-path)

Dockerfile                       production Docker image
render.yaml                      Render.com Blueprint
setup.sh                         local dev installer
```

### Engine flow

```
                         ┌─────────────┐
   user pastes URL ────► │ /api/extract │
                         └─────┬───────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                              ▼
        TikTok? ──► TikWM API          else ──► yt-dlp --dump-json
        (fast-path, direct CDN URLs)          (1000+ sites, all formats)
                │                              │
                └──────────────┬───────────────┘
                               ▼
                  preview card + format picker
                               │
                  user clicks "Download to device"
                               │
                ┌──────────────┴──────────────┐
                ▼                              ▼
        TikTok (streamable)            yt-dlp (needs processing)
                │                              │
        /api/stream ────► proxy CDN     /api/download ────► yt-dlp + ffmpeg
        straight to browser              extract → merge → return file
```

---

## 🛠 Tech stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4,
  shadcn/ui, Lucide icons
- **Backend**: Next.js API routes (Node.js runtime)
- **Downloader engine**: [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) (Python, MIT)
- **TikTok fast-path**: [TikWM](https://www.tikwm.com) public API (no auth)
- **Media processing**: `ffmpeg` (called by yt-dlp)

---

## ⚠️ Notes & limitations

- **TikTok URLs expire** — TikWM returns signed CDN URLs valid for ~1–2 hours.
  Re-extract if you waited too long.
- **Age-restricted / members-only YouTube videos** require cookies. See the
  [yt-dlp docs](https://github.com/yt-dlp/yt-dlp/wiki/Extractors).
- **Instagram private accounts** cannot be downloaded without auth.
- **Large 4K downloads** can take several minutes. Render's free tier has a
  100s request timeout — for 4K videos, bump to a paid plan.
- If a site suddenly stops working, run `pip3 install --user --upgrade yt-dlp`.
  yt-dlp ships weekly updates that fix YouTube's signature changes.

---

## 🔒 Privacy

- Runs entirely on **your** server. No third-party trackers.
- Temp files are written to `os.tmpdir()` and deleted after the response.
- No URL logging, no analytics, no telemetry.

---

## 📜 License

MIT. See [LICENSE](./LICENSE).

Third-party engines have their own licenses:

- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) — Unlicense
- [TikWM](https://www.tikwm.com) — public free API
- [`ffmpeg`](https://ffmpeg.org) — LGPL/GPL
- [shadcn/ui](https://ui.shadcn.com) — MIT

---

## 🤝 Credits

- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) maintainers — without them, this
  project would be impossible. Star their repo.
- [TikWM](https://www.tikwm.com) — free public TikTok API.

---

<sub>vibecoded by <strong>RYZISHIN</strong></sub>
