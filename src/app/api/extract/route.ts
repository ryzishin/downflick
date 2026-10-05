import { NextRequest, NextResponse } from "next/server";
import { detectPlatform, isProbablyUrl, type PlatformInfo } from "@/lib/platform";
import { getMediaInfo, type YtDlpInfo, type YtDlpFormat } from "@/lib/yt-dlp";
import { fetchTikwm } from "@/lib/tikwm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FormatOption {
  id: string;
  label: string;
  ext: string;
  /** "video" | "audio" | "image" */
  kind: "video" | "audio" | "image";
  /** approx bytes if known */
  size?: number;
  /** Original yt-dlp format_id (for video/audio) or tikwm URL (for tiktok) */
  source: string;
  /** Whether this format streams directly (tikwm) vs. requires yt-dlp processing */
  streamable: boolean;
  url?: string;
  /** Short resolution tag shown in the UI (e.g. "4K", "1080p", "Audio") */
  qualityTag?: string;
  /**
   * "primary" formats appear at the top of the list and are always visible.
   * "more" formats are hidden behind a "More qualities" expandable section.
   */
  primary: boolean;
}

interface ExtractResponse {
  ok: boolean;
  error?: string;
  platform?: PlatformInfo;
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  formats?: FormatOption[];
  hasImages?: boolean;
  metaSource?: "yt-dlp" | "tikwm";
}

/**
 * POST /api/extract
 * Body: { "url": "..." }
 *
 * Auto-detects the platform from the URL, then either:
 *   • Calls TikWM for TikTok URLs (faster, returns ready-to-stream URLs)
 *   • Calls yt-dlp --dump-json for everything else (1000+ sites supported)
 *
 * Returns a normalised set of format options the frontend can render.
 * Format ordering:
 *   1. Best MP4 (highest available resolution) — primary
 *   2. MP3 Audio (extracted from any video)    — primary
 *   3. Lower-resolution MP4s (1080p, 720p, ...) — more
 *   4. Platform-specific extras (watermarked, etc.) — more
 */
export async function POST(req: NextRequest): Promise<NextResponse<ExtractResponse>> {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url || !isProbablyUrl(url)) {
    return NextResponse.json({ ok: false, error: "Please paste a valid URL (must start with http:// or https://)" }, { status: 400 });
  }

  const platform = detectPlatform(url);

  // --- TikTok → TikWM fast-path ---------------------------------------------------
  if (platform.usesTikwm) {
    const tikwm = await fetchTikwm(url);
    if (!tikwm.ok || !tikwm.data) {
      return extractWithYtDlp(url, platform, tikwm.error ?? "TikWM failed");
    }
    const data = tikwm.data;
    const formats: FormatOption[] = [];

    // Build a list of available video variants in order of preference.
    // HD (best) → no-watermark → watermarked. The first one we find becomes
    // the primary video format so the user always sees a video option without
    // having to expand "More qualities".
    const videoVariants: Array<{
      key: string;
      url?: string;
      size?: number;
      label: string;
      qualityTag: string;
    }> = [
      { key: "hd", url: data.hdplay, size: data.hd_size, label: "HD Video", qualityTag: "HD" },
      { key: "nowm", url: data.play, size: data.size, label: "No-watermark Video", qualityTag: "SD" },
      { key: "wm", url: data.wmplay, size: data.wm_size, label: "Watermarked Video", qualityTag: "WM" },
    ];

    let firstVideo = true;
    for (const v of videoVariants) {
      if (!v.url) continue;
      formats.push({
        id: `tikwm-${v.key}`,
        label: `${v.label}${v.size ? ` · ${formatBytes(v.size)}` : ""}`,
        ext: "mp4",
        kind: "video",
        size: v.size,
        source: v.url,
        streamable: true,
        url: v.url,
        qualityTag: v.qualityTag,
        // First available video variant is primary, the rest are "more"
        primary: firstVideo,
      });
      firstVideo = false;
    }

    // MP3 audio is always primary on TikTok (TikWM returns the music URL)
    if (data.music) {
      formats.push({
        id: "tikwm-audio",
        label: `Original Audio (MP3)`,
        ext: "mp3",
        kind: "audio",
        source: data.music,
        streamable: true,
        url: data.music,
        qualityTag: "MP3",
        primary: true,
      });
    }

    return NextResponse.json({
      ok: true,
      platform,
      title: data.title || "TikTok video",
      uploader: data.author?.nickname || data.author?.unique_id,
      duration: data.duration,
      thumbnail: data.cover || data.origin_cover,
      formats,
      hasImages: Array.isArray(data.images) && data.images.length > 0,
      metaSource: "tikwm",
    });
  }

  return extractWithYtDlp(url, platform);
}

/**
 * Fallback / default path — uses yt-dlp to extract metadata for any URL
 * (including YouTube, Facebook, Instagram, X/Twitter, Vimeo, Twitch,
 * SoundCloud, Reddit, Dailymotion, Bilibili, Pinterest, Streamable,
 * LinkedIn, Tumblr, Snapchat, Imgur, and 1000+ more sites).
 */
async function extractWithYtDlp(
  url: string,
  platform: PlatformInfo,
  fallbackNote?: string,
): Promise<NextResponse<ExtractResponse>> {
  let info: YtDlpInfo;
  try {
    info = await getMediaInfo(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: fallbackNote
          ? `TikWM failed (${fallbackNote}) and yt-dlp also failed: ${message}`
          : `Could not extract media info: ${message}`,
      },
      { status: 502 },
    );
  }

  // === Categorise yt-dlp formats ==============================================
  //   • combined   → video + audio in one file (rare on modern YouTube, common on
  //                  TikTok via TikWM and on legacy sites)
  //   • videoOnly  → video stream without audio (DASH — needs merge)
  //   • audioOnly  → audio stream without video (used for MP3 extraction)
  const combined = info.formats.filter(
    (f) => f.vcodec && f.vcodec !== "none" && f.acodec && f.acodec !== "none",
  );
  const videoOnly = info.formats.filter(
    (f) => f.vcodec && f.vcodec !== "none" && (!f.acodec || f.acodec === "none"),
  );
  const audioOnly = info.formats.filter(
    (f) => (!f.vcodec || f.vcodec === "none") && f.acodec && f.acodec !== "none",
  );
  const hasAnyVideo = combined.length > 0 || videoOnly.length > 0;

  const formats: FormatOption[] = [];

  // === Primary #1: Best MP4 (highest available resolution) =====================
  // We prefer combined formats when available (no merge needed, faster). When
  // the source only has DASH streams (modern YouTube), we build a "merge" format
  // selector that asks yt-dlp to combine bestvideo[height<=X]+bestaudio.
  let bestHeight = 0;
  let bestFormatSource = "";
  let bestFormatSize: number | undefined;

  // Check combined formats first
  const bestCombined = combined
    .filter((f) => f.ext === "mp4" || f.video_ext === "mp4" || f.ext === "webm" || f.ext === "mkv")
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

  if (bestCombined) {
    bestHeight = bestCombined.height ?? 0;
    bestFormatSource = bestCombined.format_id;
    bestFormatSize = bestCombined.filesize ?? bestCombined.filesize_approx;
  } else if (videoOnly.length > 0) {
    // Use the highest-resolution video-only stream as the "best".
    // Prefer formats with a known filesize (HTTPS streams) over m3u8 (which
    // often have filesize=null because they're chunked).
    const bestVideo = videoOnly
      .filter((f) => f.ext === "mp4" || f.video_ext === "mp4" || f.ext === "webm")
      .sort((a, b) => {
        // HTTPS (filesize known) first, then by height
        const aHasSize = (a.filesize ?? a.filesize_approx ?? 0) > 0 ? 1 : 0;
        const bHasSize = (b.filesize ?? b.filesize_approx ?? 0) > 0 ? 1 : 0;
        if (aHasSize !== bHasSize) return bHasSize - aHasSize;
        return (b.height ?? 0) - (a.height ?? 0);
      })[0];
    if (bestVideo) {
      bestHeight = bestVideo.height ?? 0;
      // Build a yt-dlp format selector that merges best video at this height
      // with best audio. yt-dlp handles the merge via ffmpeg.
      bestFormatSource = `bestvideo[height<=${bestHeight}]+bestaudio/best[height<=${bestHeight}]`;
      const videoSize = bestVideo.filesize ?? bestVideo.filesize_approx ?? 0;
      const audioSize = audioOnly[0]?.filesize ?? audioOnly[0]?.filesize_approx ?? 0;
      bestFormatSize = videoSize + audioSize || undefined;
    }
  }

  if (bestFormatSource) {
    formats.push({
      id: "best-mp4",
      label: `Best MP4 ${heightToLabel(bestHeight)}${bestFormatSize ? ` · ${formatBytes(bestFormatSize)}` : ""}`,
      ext: "mp4",
      kind: "video",
      size: bestFormatSize,
      source: bestFormatSource,
      streamable: false,
      qualityTag: heightToShortTag(bestHeight),
      primary: true,
    });
  }

  // === Primary #2: MP3 Audio (always offered when there's any video) ==========
  // yt-dlp can extract audio from any video stream (YouTube, FB, IG, X, Vimeo,
  // Twitch, Reddit, SoundCloud, etc.). We use `bestaudio/best` and let yt-dlp
  // convert to MP3 via ffmpeg.
  if (hasAnyVideo) {
    formats.push({
      id: "mp3-extract",
      label: "MP3 Audio (highest quality)",
      ext: "mp3",
      kind: "audio",
      source: "bestaudio/best",
      streamable: false,
      qualityTag: "MP3",
      primary: true,
    });
  }

  // === More: Lower-resolution MP4 variants ====================================
  // Build a list of distinct resolutions available in the source, then offer
  // each one as a merge-based format. Skip the highest (already primary) and
  // skip resolutions below 144p (too low to be useful).
  if (videoOnly.length > 0 || combined.length > 0) {
    const allVideoFormats = [...videoOnly, ...combined];
    const heightsSet = new Set<number>();
    for (const f of allVideoFormats) {
      if (f.height && f.height >= 144) heightsSet.add(f.height);
    }
    const heights = Array.from(heightsSet).sort((a, b) => b - a);

    for (const h of heights) {
      // Skip the top one (already used as primary)
      if (h === bestHeight) continue;

      // Pick the best video format at this height. Prefer HTTPS streams (which
      // have filesize info) over m3u8 streams (which usually don't).
      const candidate = allVideoFormats
        .filter((f) => f.height === h && (f.ext === "mp4" || f.video_ext === "mp4" || f.ext === "webm"))
        .sort((a, b) => {
          const aHasSize = (a.filesize ?? a.filesize_approx ?? 0) > 0 ? 1 : 0;
          const bHasSize = (b.filesize ?? b.filesize_approx ?? 0) > 0 ? 1 : 0;
          if (aHasSize !== bHasSize) return bHasSize - aHasSize;
          return (b.tbr ?? 0) - (a.tbr ?? 0);
        })[0];

      if (!candidate) continue;

      const videoSize = candidate.filesize ?? candidate.filesize_approx ?? 0;
      const audioSize = audioOnly[0]?.filesize ?? audioOnly[0]?.filesize_approx ?? 0;
      const totalSize = videoSize + audioSize || undefined;

      formats.push({
        id: `mp4-${h}`,
        label: `MP4 ${heightToLabel(h)}${totalSize ? ` · ${formatBytes(totalSize)}` : ""}`,
        ext: "mp4",
        kind: "video",
        size: totalSize,
        // Merge best video at this height + best audio
        source: `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`,
        streamable: false,
        qualityTag: heightToShortTag(h),
        primary: false,
      });
    }
  }

  const thumbnail =
    info.thumbnail ||
    (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : undefined);

  return NextResponse.json({
    ok: true,
    platform,
    title: info.title || "Untitled media",
    uploader: info.uploader ?? info.channel,
    duration: info.duration,
    thumbnail,
    formats,
    hasImages: false,
    metaSource: "yt-dlp",
  });
}

// === Helpers =================================================================

function heightToLabel(h: number): string {
  if (h >= 2160) return "4K (2160p)";
  if (h >= 1440) return "2K (1440p)";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h >= 480) return "480p";
  if (h >= 360) return "360p";
  if (h >= 240) return "240p";
  return `${h}p`;
}

function heightToShortTag(h: number): string {
  if (h >= 2160) return "4K";
  if (h >= 1440) return "2K";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h >= 480) return "480p";
  if (h >= 360) return "360p";
  if (h >= 240) return "240p";
  return `${h}p`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}
