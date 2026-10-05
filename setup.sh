#!/usr/bin/env bash
# DownFlick setup script.
#
# Installs:
#   • Node.js dependencies (via bun or npm)
#   • Python yt-dlp (the gold-standard video extractor)
#   • ffmpeg (needed for MP3 extraction and video merging)
#
# Run this once before starting the dev server.
set -e

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "============================================="
echo "  DownFlick — setup"
echo "============================================="

# ---- 1. Node.js deps --------------------------------------------------------
if command -v bun >/dev/null 2>&1; then
  echo "→ Installing Node.js dependencies via bun..."
  bun install
elif command -v npm >/dev/null 2>&1; then
  echo "→ Installing Node.js dependencies via npm..."
  npm install
else
  echo "✗ Neither bun nor npm found. Install Node.js first: https://nodejs.org"
  exit 1
fi

# ---- 2. yt-dlp --------------------------------------------------------------
echo ""
if command -v yt-dlp >/dev/null 2>&1; then
  echo "→ yt-dlp already installed: $(yt-dlp --version)"
else
  echo "→ Installing yt-dlp via pip..."
  if command -v pip3 >/dev/null 2>&1; then
    pip3 install --user yt-dlp || pip3 install --break-system-packages yt-dlp
  elif command -v pip >/dev/null 2>&1; then
    pip install --user yt-dlp
  else
    echo "✗ pip not found. Install yt-dlp manually:"
    echo "    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp"
    exit 1
  fi
fi

# Make sure ~/.local/bin is on PATH for this session AND tell the user.
YT_DLP_PATH="$(command -v yt-dlp || echo "$HOME/.local/bin/yt-dlp")"
echo "  yt-dlp location: $YT_DLP_PATH"

# ---- 3. ffmpeg --------------------------------------------------------------
echo ""
if command -v ffmpeg >/dev/null 2>&1; then
  echo "→ ffmpeg already installed: $(ffmpeg -version | head -1)"
else
  echo "→ Installing ffmpeg..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y ffmpeg
  elif command -v brew >/dev/null 2>&1; then
    brew install ffmpeg
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y ffmpeg
  else
    echo "✗ Could not auto-install ffmpeg. Install it manually: https://ffmpeg.org/download.html"
    echo "  (yt-dlp needs ffmpeg to merge HD video + audio streams and to extract MP3 audio.)"
  fi
fi

# ---- 4. Verify --------------------------------------------------------------
echo ""
echo "============================================="
echo "  Setup complete!"
echo "============================================="
echo ""
echo "  Next: start the dev server"
echo "    bun run dev    # or: npm run dev"
echo ""
echo "  Then open http://localhost:3000"
echo ""
