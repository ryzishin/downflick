"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ClipboardPaste,
  Download,
  Link2,
  Loader2,
  Music2,
  Sparkles,
  Video,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { detectPlatform, type PlatformInfo, isProbablyUrl, PLATFORM_INFO, type Platform } from "@/lib/platform";
import { toast } from "sonner";

interface FormatOption {
  id: string;
  label: string;
  ext: string;
  kind: "video" | "audio" | "image";
  size?: number;
  source: string;
  streamable: boolean;
  url?: string;
  qualityTag?: string;
  primary?: boolean;
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

// Minimal subset of platforms to show as quick-select chips (mobile-friendly)
const QUICK_PLATFORMS: Array<{ key: Platform; label: string }> = [
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "twitter", label: "X" },
  { key: "reddit", label: "Reddit" },
];

const SAMPLE_LINKS: Array<{ label: string; url: string }> = [
  { label: "YouTube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  { label: "TikTok", url: "https://www.tiktok.com/@tiktok/video/7106594312292453675" },
];

// === Main component ==========================================================

export function DownFlickApp() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [extracted, setExtracted] = useState<ExtractResponse | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Live platform detection — memoized, very cheap
  const detectedPlatform = useMemo(() => detectPlatform(url), [url]);
  const urlValid = isProbablyUrl(url);

  // Listen for global paste — auto-fill the input
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      if (text && isProbablyUrl(text) && inputRef.current && document.activeElement !== inputRef.current) {
        setUrl(text);
        setPasteHint("Pasted — ready to extract");
        setTimeout(() => setPasteHint(null), 2500);
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  // Reset selection when a new extraction happens
  useEffect(() => {
    if (extracted?.formats && extracted.formats.length > 0) {
      setSelectedFormatId(extracted.formats[0].id);
    } else {
      setSelectedFormatId(null);
    }
  }, [extracted]);

  const handleExtract = useCallback(async () => {
    if (!urlValid) {
      toast.error("Please paste a valid URL first.");
      return;
    }
    setLoading(true);
    setExtracted(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data: ExtractResponse = await res.json();
      if (!data.ok) {
        toast.error(data.error ?? "Failed to extract media info");
        setExtracted(null);
      } else {
        setExtracted(data);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error during extract");
    } finally {
      setLoading(false);
    }
  }, [url, urlValid]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        toast.success("Pasted from clipboard");
      } else {
        toast.error("Clipboard is empty");
      }
    } catch {
      toast.error("Cannot read clipboard — try pasting with Ctrl+V");
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (!extracted || !selectedFormatId) {
      toast.error("Pick a format first");
      return;
    }
    const format = extracted.formats?.find((f) => f.id === selectedFormatId);
    if (!format) {
      toast.error("Selected format is no longer available");
      return;
    }

    setDownloading(true);
    const safeTitle = (extracted.title ?? "downflick").slice(0, 80);
    const filename = `${safeTitle}.${format.ext}`;

    try {
      if (format.streamable && format.url) {
        // Direct stream from upstream CDN via our proxy (TikTok / TikWM)
        const streamUrl = `/api/stream?url=${encodeURIComponent(format.url)}&filename=${encodeURIComponent(filename)}`;
        triggerBrowserDownload(streamUrl);
        toast.success(`Downloading ${filename}`);
      } else {
        // yt-dlp-driven download
        const res = await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            formatId: format.source,
            audioOnly: format.kind === "audio",
            title: safeTitle,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error ?? `Download failed (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        triggerBrowserDownload(objectUrl, filename);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
        toast.success(`Saved ${filename}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [extracted, selectedFormatId, url]);

  // ⌘/Ctrl+Enter to extract
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && urlValid && !loading) {
        e.preventDefault();
        handleExtract();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleExtract, urlValid, loading]);

  return (
    <div className="relative min-h-[100svh] flex flex-col">
      <div className="df-aurora" aria-hidden="true" />
      <div className="df-grid" aria-hidden="true" />

      {/* Compact header */}
      <header className="relative z-10 px-4 sm:px-6 pt-5 sm:pt-6">
        <div className="mx-auto max-w-2xl flex items-center justify-center gap-2.5">
          <div className="w-9 h-9 rounded-xl df-btn-primary flex items-center justify-center shadow-lg">
            <ArrowDownToLine className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white">
            Down<span className="text-purple-400">Flick</span>
          </h1>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 px-4 sm:px-6 pt-8 sm:pt-14 pb-8 flex flex-col justify-start">
        <div className="mx-auto w-full max-w-2xl">
          {/* Hero */}
          <div className="text-center mb-6 sm:mb-8 df-fade-in">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3 leading-[1.15]">
              Download anything,
              <br />
              <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                straight to your device.
              </span>
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base">
              Paste a link from YouTube, TikTok, Instagram, Facebook, X, Reddit, and 1,000+ more.
            </p>
          </div>

          {/* Input card */}
          <div className="df-card-glass rounded-2xl p-4 sm:p-5 df-glow df-fade-in">
            <div className="relative">
              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste any video link..."
                className="df-input w-full pl-10 pr-24 py-3.5 rounded-xl text-base text-white placeholder-zinc-500"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="url"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {urlValid && detectedPlatform.key !== "unknown" && (
                  <span
                    className={`hidden xs:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white bg-gradient-to-r ${detectedPlatform.gradient}`}
                  >
                    <span>{detectedPlatform.emoji}</span>
                    <span className="hidden sm:inline">{detectedPlatform.label}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition"
                  title="Paste from clipboard"
                  aria-label="Paste from clipboard"
                >
                  <ClipboardPaste className="w-4 h-4" />
                </button>
              </div>
            </div>

            {pasteHint && (
              <div className="mt-2 text-xs text-purple-300 flex items-center gap-1.5 df-fade-in">
                <Sparkles className="w-3 h-3" />
                {pasteHint}
              </div>
            )}

            <button
              type="button"
              onClick={handleExtract}
              disabled={!urlValid || loading}
              className="mt-3 w-full df-btn-primary px-5 py-3.5 rounded-xl font-semibold text-white text-sm inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Extract media
                </>
              )}
            </button>
          </div>

          {/* Sample chips — only shown when no extraction yet, to keep the screen clean */}
          {!loading && !extracted && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 df-fade-in">
              <span className="text-[11px] text-zinc-600 mr-1">Try:</span>
              {SAMPLE_LINKS.map((sample) => (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => setUrl(sample.url)}
                  className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/10 text-[11px] text-zinc-300 hover:text-white transition border border-white/5"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          )}

          {/* Extracted preview */}
          {loading && <ExtractSkeleton />}

          {!loading && extracted && extracted.ok && (
            <ExtractedPreview
              extracted={extracted}
              selectedFormatId={selectedFormatId}
              onSelectFormat={setSelectedFormatId}
              onDownload={handleDownload}
              downloading={downloading}
            />
          )}

          {!loading && extracted && !extracted.ok && (
            <div className="mt-4 df-card-glass rounded-2xl p-4 border-l-2 border-red-500 df-fade-in">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">Could not extract media</p>
                  <p className="text-xs text-zinc-400 mt-1 break-words">{extracted.error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-4 sm:px-6 py-4 mt-auto border-t border-white/5">
        <div className="mx-auto max-w-2xl flex items-center justify-center gap-1.5 text-[11px] text-zinc-600">
          <span>vibecoded by</span>
          <a
            href="https://github.com/ryzishin"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-zinc-400 hover:text-white transition"
          >
            RYZISHIN
          </a>
        </div>
      </footer>
    </div>
  );
}

// === Memoized sub-components (perf) =========================================

const ExtractSkeleton = memo(function ExtractSkeleton() {
  return (
    <div className="mt-4 df-card-glass rounded-2xl p-4 sm:p-5 df-fade-in">
      <div className="flex gap-3">
        <div className="w-24 h-16 rounded-lg df-shimmer flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-3/4 rounded df-shimmer" />
          <div className="h-3 w-1/3 rounded df-shimmer" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-10 rounded-lg df-shimmer" />
        <div className="h-10 rounded-lg df-shimmer" />
      </div>
      <div className="mt-4 h-11 rounded-lg df-shimmer" />
    </div>
  );
});

interface ExtractedPreviewProps {
  extracted: ExtractResponse;
  selectedFormatId: string | null;
  onSelectFormat: (id: string) => void;
  onDownload: () => void;
  downloading: boolean;
}

const ExtractedPreview = memo(function ExtractedPreview({
  extracted,
  selectedFormatId,
  onSelectFormat,
  onDownload,
  downloading,
}: ExtractedPreviewProps) {
  const durationLabel = extracted.duration
    ? `${Math.floor(extracted.duration / 60)}:${String(extracted.duration % 60).padStart(2, "0")}`
    : null;

  // Split formats into "primary" (always visible) and "more" (expandable)
  const allFormats = extracted.formats ?? [];
  const primaryFormats = allFormats.filter((f) => f.primary !== false);
  const moreFormats = allFormats.filter((f) => f.primary === false);
  const hasMore = moreFormats.length > 0;
  const [showMore, setShowMore] = useState(false);

  // Auto-expand "more" if the user has nothing else to pick (no primary formats)
  // OR if the currently selected format lives in the "more" list.
  const selectedInMore = selectedFormatId
    ? moreFormats.some((f) => f.id === selectedFormatId)
    : false;
  const effectiveShowMore = showMore || (primaryFormats.length === 0 && hasMore) || selectedInMore;

  return (
    <div className="mt-4 df-card-glass rounded-2xl p-4 sm:p-5 df-fade-in">
      {/* Thumbnail + title */}
      <div className="flex gap-3 mb-4">
        {extracted.thumbnail ? (
          <img
            src={extracted.thumbnail}
            alt=""
            className="w-24 h-16 sm:w-32 sm:h-20 object-cover rounded-lg border border-white/10 flex-shrink-0 bg-white/5"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-24 h-16 sm:w-32 sm:h-20 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
            <Video className="w-4 h-4 text-zinc-600" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            {extracted.platform && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold text-white bg-gradient-to-r ${extracted.platform.gradient}`}
              >
                {extracted.platform.emoji} {extracted.platform.label}
              </span>
            )}
            {durationLabel && (
              <span className="text-[10px] text-zinc-500">{durationLabel}</span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug">
            {extracted.title ?? "Untitled media"}
          </h3>
          {extracted.uploader && (
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">@{extracted.uploader}</p>
          )}
        </div>
      </div>

      {/* Primary formats (always visible) */}
      <div className="space-y-1.5">
        {primaryFormats.map((f) => (
          <FormatRow
            key={f.id}
            format={f}
            selected={selectedFormatId === f.id}
            onSelect={() => onSelectFormat(f.id)}
          />
        ))}
        {primaryFormats.length === 0 && !hasMore && (
          <div className="text-xs text-zinc-500 p-3 text-center border border-dashed border-white/10 rounded-lg">
            No downloadable formats found.
          </div>
        )}
      </div>

      {/* "More qualities" expandable section */}
      {hasMore && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="w-full flex items-center justify-center gap-1 py-2 text-[11px] text-zinc-400 hover:text-white transition"
            aria-expanded={effectiveShowMore}
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${effectiveShowMore ? "rotate-180" : ""}`}
            />
            {effectiveShowMore ? "Hide more qualities" : `More qualities (${moreFormats.length})`}
          </button>
          {effectiveShowMore && (
            <div className="space-y-1.5 df-fade-in">
              {moreFormats.map((f) => (
                <FormatRow
                  key={f.id}
                  format={f}
                  selected={selectedFormatId === f.id}
                  onSelect={() => onSelectFormat(f.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Download button */}
      {allFormats.length > 0 && (
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading || !selectedFormatId}
          className="mt-4 w-full df-btn-primary px-5 py-3.5 rounded-xl font-semibold text-white text-sm inline-flex items-center justify-center gap-2"
        >
          {downloading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Download to device
            </>
          )}
        </button>
      )}
    </div>
  );
});

interface FormatRowProps {
  format: FormatOption;
  selected: boolean;
  onSelect: () => void;
}

const FormatRow = memo(function FormatRow({ format, selected, onSelect }: FormatRowProps) {
  const Icon = format.kind === "audio" ? Music2 : Video;
  const sizeLabel = format.size ? formatBytes(format.size) : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-selected={selected ? "true" : "false"}
      className="df-format-row w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-white/5 text-left"
    >
      <div
        className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
          format.kind === "audio"
            ? "bg-orange-500/15 text-orange-300"
            : "bg-purple-500/15 text-purple-300"
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{format.label}</p>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
          {format.ext}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
          {format.streamable ? " · direct" : " · transcoded"}
        </p>
      </div>
      {format.qualityTag && (
        <span className="text-[10px] font-semibold text-zinc-400 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded flex-shrink-0">
          {format.qualityTag}
        </span>
      )}
      <div
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
          selected ? "border-purple-400 bg-purple-500/30" : "border-zinc-600"
        }`}
      >
        {selected && <CheckCircle2 className="w-3 h-3 text-purple-300" />}
      </div>
    </button>
  );
});

// === Helpers =================================================================

function triggerBrowserDownload(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
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
