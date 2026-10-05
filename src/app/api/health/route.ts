import { NextResponse } from "next/server";
import { resolveYtDlpPath } from "@/lib/yt-dlp";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Returns whether the server can find yt-dlp on PATH. The frontend uses
 * this to display a status indicator (and to disable the download button
 * with a friendly message if yt-dlp is missing).
 */
export async function GET() {
  const bin = resolveYtDlpPath();

  let version: string | null = null;
  if (bin) {
    try {
      const out = await new Promise<string>((resolve) => {
        const child = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        child.stdout.on("data", (c) => (stdout += c.toString()));
        child.on("close", () => resolve(stdout.trim()));
        child.on("error", () => resolve(""));
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5_000);
      });
      version = out.split("\n")[0] || null;
    } catch {
      version = null;
    }
  }

  return NextResponse.json({
    ok: true,
    ytDlp: {
      found: Boolean(bin),
      path: bin,
      version,
    },
    timestamp: new Date().toISOString(),
  });
}
