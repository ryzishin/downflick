import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

/**
 * Resolve the yt-dlp binary path. We try, in order:
 *   1. $YTDLP_PATH env var
 *   2. `yt-dlp` on $PATH (resolved by shell)
 *   3. Common user-local install locations (`~/.local/bin/yt-dlp`, `~/bin/yt-dlp`)
 *   4. A vendored copy at `<repo>/bin/yt-dlp` if present
 *
 * yt-dlp is the gold standard for downloading from 1000+ video platforms
 * (YouTube, Instagram, Facebook, X/Twitter, Vimeo, Twitch, SoundCloud,
 * Reddit, Dailymotion, Bilibili, Pinterest, Streamable, LinkedIn, Tumblr,
 * Snapchat, Imgur, and many more). It is updated weekly, which is why we
 * shell out to it rather than reimplementing extractors in JS.
 */

function candidatePaths(): string[] {
  const candidates: string[] = [];
  if (process.env.YTDLP_PATH) candidates.push(process.env.YTDLP_PATH);
  candidates.push("yt-dlp"); // hope it is on PATH
  candidates.push(path.join(os.homedir(), ".local", "bin", "yt-dlp"));
  candidates.push(path.join(os.homedir(), "bin", "yt-dlp"));
  candidates.push("/usr/local/bin/yt-dlp");
  candidates.push("/usr/bin/yt-dlp");
  candidates.push(path.join(process.cwd(), "bin", "yt-dlp"));
  return candidates;
}

let cachedPath: string | null | undefined;

export function resolveYtDlpPath(): string | null {
  if (cachedPath !== undefined) return cachedPath;
  const fsSync = fs;
  for (const candidate of candidatePaths()) {
    try {
      // For bare "yt-dlp" we cannot stat it directly, so skip the stat check.
      if (candidate.includes(path.sep)) {
        if (fsSync.existsSync(candidate) && fsSync.statSync(candidate).isFile()) {
          cachedPath = candidate;
          return cachedPath;
        }
      }
    } catch {
      // ignore
    }
  }
  // Fallback: assume "yt-dlp" is on PATH. The caller will handle ENOENT.
  cachedPath = "yt-dlp";
  return cachedPath;
}

export interface YtDlpFormat {
  format_id: string;
  ext: string;
  resolution?: string;
  width?: number;
  height?: number;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  vbr?: number;
  abr?: number;
  format_note?: string;
  audio_ext?: string;
  video_ext?: string;
}

export interface YtDlpInfo {
  id: string;
  title: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url: string; width?: number; height?: number }>;
  ext?: string;
  extractor_key?: string;
  extractor?: string;
  webpage_url?: string;
  formats: YtDlpFormat[];
  is_live?: boolean;
  availability?: string;
  upload_date?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  description?: string;
}

export interface YtDlpError {
  error: string;
  stderr?: string;
  code?: number;
}

function runYtDlp(args: string[], opts: { timeoutMs?: number } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const bin = resolveYtDlpPath();
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          try { child.kill("SIGKILL"); } catch {}
          resolve({ code: 124, stdout, stderr: stderr + "\n[timeout]" });
        }, opts.timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + "\n" + (err?.message ?? String(err)) });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

/**
 * Ask yt-dlp for a JSON dump of all available formats + metadata.
 * We pass --no-warnings to keep stderr clean and --skip-download to
 * ensure nothing is actually downloaded at this stage.
 */
export async function getMediaInfo(url: string): Promise<YtDlpInfo> {
  const args = [
    "--no-warnings",
    "--skip-download",
    "--dump-json",
    "--no-playlist",
    // Some platforms (TikTok, IG) need a UA to avoid 403s.
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    url,
  ];
  const result = await runYtDlp(args, { timeoutMs: 60_000 });
  if (result.code !== 0 || !result.stdout.trim()) {
    const stderrTail = result.stderr.trim().split("\n").slice(-3).join(" ");
    throw new Error(stderrTail || `yt-dlp exited with code ${result.code}`);
  }
  // yt-dlp may emit multiple JSON lines if the URL is a playlist;
  // we asked for --no-playlist so there should be exactly one.
  const firstLine = result.stdout.trim().split("\n")[0];
  return JSON.parse(firstLine) as YtDlpInfo;
}

/**
 * Pick a "best" combined (video+audio) MP4 format for the user-facing UI.
 * Returns null when no combined format is available (then we need merge).
 */
export function pickBestMp4(info: YtDlpInfo): YtDlpFormat | null {
  const combined = info.formats.filter(
    (f) =>
      f.vcodec &&
      f.vcodec !== "none" &&
      f.acodec &&
      f.acodec !== "none" &&
      (f.ext === "mp4" || f.video_ext === "mp4"),
  );
  if (combined.length === 0) return null;
  combined.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return combined[0];
}

/**
 * Generate a safe output filename from yt-dlp metadata.
 */
export function safeFilename(name: string, ext: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const safeExt = ext.replace(/^\.+/, "").toLowerCase();
  return `${cleaned || "downflick"}.${safeExt}`;
}

/**
 * Allocate a temp file path for yt-dlp to write into. We use a random
 * subdir so concurrent downloads never collide.
 */
export function tempOutputPath(ext: string): { dir: string; file: string } {
  const dir = path.join(os.tmpdir(), "downflick", crypto.randomBytes(8).toString("hex"));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `output.%(ext)s`);
  return { dir, file };
}

/**
 * Spawn yt-dlp to download a specific format (or "best"/"bestaudio")
 * to disk, returning the resulting file path. Cleans up on failure.
 */
export async function downloadToFile(
  url: string,
  opts: { formatId?: string; audioOnly?: boolean; outputTemplate: string },
): Promise<{ filePath: string; ext: string; size: number }> {
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--no-mtime",
    "-f", opts.formatId ?? (opts.audioOnly ? "bestaudio/best" : "bestvideo+bestaudio/best"),
    "-o", opts.outputTemplate,
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    url,
  ];
  if (opts.audioOnly) {
    // Extract audio + re-encode to mp3 with embedded thumbnail.
    // --merge-output-format is intentionally NOT set here (it only accepts
    // video container formats like mp4/mkv/webm).
    args.push(
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "--embed-thumbnail",
    );
  } else {
    // For video, allow yt-dlp to merge separate video/audio streams into mp4.
    args.push("--merge-output-format", "mp4");
  }
  const result = await runYtDlp(args, { timeoutMs: 8 * 60_000 });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim().split("\n").slice(-3).join(" "));
  }
  // Find the produced file. yt-dlp replaces %(ext)s with the actual extension.
  const dir = path.dirname(opts.outputTemplate);
  const files = fs.readdirSync(dir).filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
  if (files.length === 0) {
    throw new Error("yt-dlp produced no output file");
  }
  const filePath = path.join(dir, files.sort((a, b) => {
    const sa = fs.statSync(path.join(dir, a)).mtimeMs;
    const sb = fs.statSync(path.join(dir, b)).mtimeMs;
    return sb - sa;
  })[0]);
  const stat = fs.statSync(filePath);
  return {
    filePath,
    ext: path.extname(filePath).replace(/^\./, "") || (opts.audioOnly ? "mp3" : "mp4"),
    size: stat.size,
  };
}
