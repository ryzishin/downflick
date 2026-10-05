import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { downloadToFile, tempOutputPath, safeFilename, resolveYtDlpPath } from "@/lib/yt-dlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface DownloadRequest {
  url?: unknown;
  formatId?: unknown;
  audioOnly?: unknown;
  title?: unknown;
}

/**
 * POST /api/download
 * Body: { "url": "...", "formatId": "ba", "audioOnly": false, "title": "..." }
 *
 * Streams the produced file to the client. For TikTok URLs the frontend
 * should instead hit /api/stream?url=... because TikWM already gives us
 * direct CDN URLs. This route is for yt-dlp-driven downloads where we
 * actually need to extract + merge audio/video.
 */
export async function POST(req: NextRequest) {
  let body: DownloadRequest;
  try {
    body = (await req.json()) as DownloadRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const formatId = typeof body.formatId === "string" ? body.formatId.trim() : "";
  const audioOnly = Boolean(body.audioOnly);
  const title = typeof body.title === "string" ? body.title : "downflick";

  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }

  const bin = resolveYtDlpPath();
  if (!bin) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "yt-dlp is not installed on this server. Install it with `pip install yt-dlp` (Python) or download the binary from https://github.com/yt-dlp/yt-dlp/releases",
      },
      { status: 500 },
    );
  }

  const { dir, file: template } = tempOutputPath(audioOnly ? "mp3" : "mp4");
  let result;
  try {
    result = await downloadToFile(url, {
      formatId: formatId || undefined,
      audioOnly,
      outputTemplate: template,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  const filename = safeFilename(title, result.ext);
  const stat = fs.statSync(result.filePath);
  const fileBuffer = fs.readFileSync(result.filePath);

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": mimeFromExt(result.ext),
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  switch (e) {
    case "mp4": return "video/mp4";
    case "mp3": return "audio/mpeg";
    case "m4a": return "audio/mp4";
    case "webm": return "video/webm";
    case "mkv": return "video/x-matroska";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    default: return "application/octet-stream";
  }
}
