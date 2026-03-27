import fs from "node:fs"
import path from "node:path"

export const runtime = "nodejs"

function resolveMediaRoot() {
  const cwd = process.cwd()
  const candidateInCwd = path.join(cwd, "media")
  const candidateInFrontend = path.join(cwd, "frontend", "media")
  return fs.existsSync(candidateInCwd) ? candidateInCwd : candidateInFrontend
}

function getContentType(file: string) {
  const lower = file.toLowerCase()
  if (lower.endsWith(".mp4")) return "video/mp4"
  if (lower.endsWith(".webm")) return "video/webm"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  return "application/octet-stream"
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params
  if (!file) return new Response("Not Found", { status: 404 })

  // Prevent directory traversal. Filenames are simple like `doc_examine.mp4`.
  if (!/^[a-zA-Z0-9._-]+$/.test(file)) {
    return new Response("Not Found", { status: 404 })
  }

  const mediaRoot = resolveMediaRoot()
  const filePath = path.join(mediaRoot, file)

  // Extra safety: ensure the resolved path is within the media root.
  if (!filePath.startsWith(mediaRoot)) {
    return new Response("Not Found", { status: 404 })
  }

  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    return new Response("Not Found", { status: 404 })
  }

  const contentType = getContentType(file)
  const range = req.headers.get("range")

  const cacheHeader = "public, max-age=31536000, immutable"

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!m) return new Response("Invalid Range", { status: 416 })

    const start = m[1] ? Number.parseInt(m[1], 10) : 0
    const end = m[2] ? Number.parseInt(m[2], 10) : stat.size - 1

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
      return new Response("Invalid Range", { status: 416 })
    }

    const chunkSize = end - start + 1
    const stream = fs.createReadStream(filePath, { start, end })

    return new Response(stream as unknown as BodyInit, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Cache-Control": cacheHeader,
      },
    })
  }

  const stream = fs.createReadStream(filePath)
  return new Response(stream as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(stat.size),
      "Cache-Control": cacheHeader,
    },
  })
}

