import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/stream?url=<remote mp4/mp3/image URL>
 *
 * Streams a remote URL directly to the client with a Content-Disposition
 * header so the browser saves it as a download. We use this for TikWM URLs
 * (which are already public CDN links that we just need to proxy).
 *
 * This avoids storing any data on disk and lets the client download
 * straight from the upstream CDN through our server (bypassing CORS).
 */
export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  const filenameParam = req.nextUrl.searchParams.get("filename") || "downflick.mp4";

  if (!urlParam) {
    return NextResponse.json({ ok: false, error: "Missing url query parameter" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(urlParam, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": new URL(urlParam).origin,
      },
      cache: "no-store",
      // @ts-expect-error: Next.js supports this undocumented option
      next: { revalidate: 0 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Failed to reach upstream: ${message}` }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { ok: false, error: `Upstream returned ${upstream.status} ${upstream.statusText}` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const contentLength = upstream.headers.get("content-length") || "";

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${encodeURIComponent(filenameParam)}"; filename*=UTF-8''${encodeURIComponent(filenameParam)}`,
    "Cache-Control": "no-store",
  };
  if (contentLength) headers["Content-Length"] = contentLength;

  const buf = new Uint8Array(await upstream.arrayBuffer());
  return new NextResponse(buf, { status: 200, headers });
}
