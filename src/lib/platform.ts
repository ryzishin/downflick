/**
 * Platform detection — given a URL, returns the canonical platform key
 * used by the rest of the engine. Detection is based on hostname patterns.
 */
export type Platform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "twitter"
  | "vimeo"
  | "twitch"
  | "soundcloud"
  | "reddit"
  | "dailymotion"
  | "bilibili"
  | "pinterest"
  | "streamable"
  | "linkedin"
  | "tumblr"
  | "snapchat"
  | "imgur"
  | "unknown";

export interface PlatformInfo {
  key: Platform;
  label: string;
  /** A short emoji/icon used in the UI badge */
  emoji: string;
  /** Whether we can extract audio (mp3) for this platform */
  audioOnly: boolean;
  /** Whether this platform is routed through the TikWM HTTP API */
  usesTikwm: boolean;
  /** Tailwind gradient classes for the platform badge */
  gradient: string;
}

const HOSTMAP: Array<{ pattern: RegExp; platform: Platform }> = [
  { pattern: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|m\.youtube\.com)$/i, platform: "youtube" },
  { pattern: /(^|\.)tiktok\.com$/i, platform: "tiktok" },
  { pattern: /(^|\.)(instagram\.com|instagr\.am)$/i, platform: "instagram" },
  { pattern: /(^|\.)(facebook\.com|fb\.watch|fb\.com|m\.facebook\.com)$/i, platform: "facebook" },
  { pattern: /(^|\.)(twitter\.com|x\.com|t\.co)$/i, platform: "twitter" },
  { pattern: /(^|\.)vimeo\.com$/i, platform: "vimeo" },
  { pattern: /(^|\.)(twitch\.tv|clips\.twitch\.tv|m\.twitch\.tv)$/i, platform: "twitch" },
  { pattern: /(^|\.)soundcloud\.com$/i, platform: "soundcloud" },
  { pattern: /(^|\.)(reddit\.com|redd\.it)$/i, platform: "reddit" },
  { pattern: /(^|\.)dailymotion\.com$/i, platform: "dailymotion" },
  { pattern: /(^|\.)(bilibili\.com|b23\.tv)$/i, platform: "bilibili" },
  { pattern: /(^|\.)(pinterest\.com|pin\.it)$/i, platform: "pinterest" },
  { pattern: /(^|\.)streamable\.com$/i, platform: "streamable" },
  { pattern: /(^|\.)linkedin\.com$/i, platform: "linkedin" },
  { pattern: /(^|\.)tumblr\.com$/i, platform: "tumblr" },
  { pattern: /(^|\.)(snapchat\.com|snap\.com)$/i, platform: "snapchat" },
  { pattern: /(^|\.)imgur\.com$/i, platform: "imgur" },
];

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  youtube:     { key: "youtube",     label: "YouTube",     emoji: "▶",  audioOnly: true,  usesTikwm: false, gradient: "from-red-500 to-rose-600" },
  tiktok:      { key: "tiktok",      label: "TikTok",      emoji: "♪",  audioOnly: true,  usesTikwm: true,  gradient: "from-fuchsia-500 to-cyan-400" },
  instagram:   { key: "instagram",   label: "Instagram",   emoji: "◎",  audioOnly: false, usesTikwm: false, gradient: "from-amber-500 via-pink-500 to-purple-600" },
  facebook:    { key: "facebook",    label: "Facebook",     emoji: "f",  audioOnly: true,  usesTikwm: false, gradient: "from-blue-600 to-blue-800" },
  twitter:     { key: "twitter",     label: "X / Twitter",  emoji: "X",  audioOnly: false, usesTikwm: false, gradient: "from-zinc-700 to-zinc-900" },
  vimeo:       { key: "vimeo",       label: "Vimeo",       emoji: "V",  audioOnly: true,  usesTikwm: false, gradient: "from-sky-400 to-cyan-600" },
  twitch:      { key: "twitch",      label: "Twitch",      emoji: "T",  audioOnly: false, usesTikwm: false, gradient: "from-purple-500 to-purple-700" },
  soundcloud:  { key: "soundcloud",  label: "SoundCloud",   emoji: "♫",  audioOnly: true,  usesTikwm: false, gradient: "from-orange-400 to-orange-600" },
  reddit:      { key: "reddit",      label: "Reddit",      emoji: "R",  audioOnly: false, usesTikwm: false, gradient: "from-orange-500 to-red-600" },
  dailymotion: { key: "dailymotion", label: "Dailymotion", emoji: "D",  audioOnly: true,  usesTikwm: false, gradient: "from-blue-400 to-indigo-600" },
  bilibili:    { key: "bilibili",    label: "Bilibili",    emoji: "B",  audioOnly: false, usesTikwm: false, gradient: "from-pink-400 to-sky-400" },
  pinterest:   { key: "pinterest",   label: "Pinterest",   emoji: "P",  audioOnly: false, usesTikwm: false, gradient: "from-red-500 to-rose-700" },
  streamable:  { key: "streamable",  label: "Streamable",  emoji: "S",  audioOnly: false, usesTikwm: false, gradient: "from-emerald-400 to-teal-600" },
  linkedin:    { key: "linkedin",    label: "LinkedIn",    emoji: "in",audioOnly: false, usesTikwm: false, gradient: "from-blue-500 to-blue-700" },
  tumblr:      { key: "tumblr",      label: "Tumblr",      emoji: "t",  audioOnly: false, usesTikwm: false, gradient: "from-slate-600 to-slate-800" },
  snapchat:    { key: "snapchat",    label: "Snapchat",    emoji: "👻", audioOnly: false, usesTikwm: false, gradient: "from-yellow-300 to-yellow-500" },
  imgur:       { key: "imgur",       label: "Imgur",       emoji: "I",  audioOnly: false, usesTikwm: false, gradient: "from-emerald-500 to-emerald-700" },
  unknown:     { key: "unknown",     label: "Auto",        emoji: "?",  audioOnly: true,  usesTikwm: false, gradient: "from-zinc-500 to-zinc-700" },
};

export function detectPlatform(rawUrl: string): PlatformInfo {
  let host = "";
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    // not a URL — fall through to "unknown"
    return PLATFORM_INFO.unknown;
  }
  for (const entry of HOSTMAP) {
    if (entry.pattern.test(host)) {
      return PLATFORM_INFO[entry.platform];
    }
  }
  return PLATFORM_INFO.unknown;
}

export function isProbablyUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return Boolean(u.protocol && (u.protocol === "http:" || u.protocol === "https:"));
  } catch {
    return false;
  }
}
