/**
 * TikWM API client — TikWM is a free, no-auth public API that returns
 * HD-quality TikTok video URLs (with and without watermark) as well as
 * photo/slideshow covers and audio.
 *
 * Endpoint: https://www.tikwm.com/api/
 * Verified working: 2026-10.
 */

export interface TikwmImage {
  url: string;
}

export interface TikwmResponseData {
  id: string;
  region: string;
  title: string;
  cover: string;
  origin_cover: string;
  duration: number;
  play: string;          // no-watermark mp4
  wmplay: string;        // with-watermark mp4
  hdplay: string;        // HD no-watermark mp4
  size: number;
  wm_size: number;
  hd_size: number;
  music: string;         // mp3 audio URL
  music_info?: {
    id: string;
    title: string;
    play: string;
    cover: string;
    author: string;
    original: boolean;
    duration: number;
  };
  author?: {
    id: string;
    unique_id: string;
    nickname: string;
    avatar: string;
  };
  images?: string[];      // photo-mode slideshow
  size_images?: number[];
  play_count?: number;
  digg_count?: number;
  comment_count?: number;
  share_count?: number;
  download_count?: number;
  create_time?: number;
}

export interface TikwmResponse {
  code: number;
  msg: string;
  processed_time: number;
  data?: TikwmResponseData;
}

export interface TikwmFetchResult {
  ok: boolean;
  error?: string;
  data?: TikwmResponseData;
}

export async function fetchTikwm(url: string, timeoutMs = 30_000): Promise<TikwmFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://www.tikwm.com/api/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
      // The Next.js fetch wrapper has its own caching behaviour — disable it here.
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `TikWM HTTP ${res.status}` };
    }
    const json = (await res.json()) as TikwmResponse;
    if (json.code !== 0 || !json.data) {
      return { ok: false, error: json.msg || "TikWM returned no data" };
    }
    return { ok: true, data: json.data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
