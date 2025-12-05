/**
 * Oracle Object Storage helper using PAR (Pre-Authenticated Request) URL.
 * 
 * All files are stored in a single bucket with direct PUT/GET operations.
 * No separate buckets for uploads/captions/renders - all use the same PAR URL.
 */

const ORACLE_PAR_URL = process.env.ORACLE_PAR_URL || process.env.NEXT_PUBLIC_ORACLE_PAR_URL || ""

if (!ORACLE_PAR_URL) {
  console.warn("WARNING: ORACLE_PAR_URL not configured. Storage operations will fail.")
}

/**
 * Upload a file to Oracle Object Storage
 * @param filename - The filename to store (can include path separators)
 * @param buffer - File buffer or Blob
 * @param contentType - MIME type
 * @returns The public URL of the uploaded file
 */
export async function uploadFile(
  filename: string,
  buffer: Buffer | Blob | Uint8Array,
  contentType?: string
): Promise<{ url: string; path: string }> {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9_.\/-]/g, "_")
  const uploadUrl = `${ORACLE_PAR_URL}${sanitizedFilename}`

  // Determine content type from extension if not provided
  if (!contentType) {
    const ext = sanitizedFilename.match(/\.([^.]+)$/)?.[1]?.toLowerCase()
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "heic", "heif", "avif"]
    const videoExts = ["mp4", "webm", "mov", "avi", "mkv"]
    
    if (ext && imageExts.includes(ext)) {
      contentType = `image/${ext === "jpg" ? "jpeg" : ext}`
    } else if (ext && videoExts.includes(ext)) {
      contentType = `video/${ext}`
    } else if (ext === "srt" || ext === "ass") {
      contentType = "text/plain"
    } else {
      contentType = "application/octet-stream"
    }
  }

  // Convert Buffer to Blob if needed
  let body: Blob
  if (buffer instanceof Blob) {
    body = buffer
  } else {
    body = new Blob([buffer as any])
  }

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error")
    throw new Error(`Oracle storage upload failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  return {
    url: uploadUrl,
    path: sanitizedFilename,
  }
}

/**
 * Download a file from Oracle Object Storage
 * @param filename - The filename to download
 * @returns ReadableStream of the file content
 */
export async function downloadFile(filename: string): Promise<ReadableStream> {
  const downloadUrl = `${ORACLE_PAR_URL}${filename}`

  const response = await fetch(downloadUrl, {
    method: "GET",
  })

  if (!response.ok) {
    throw new Error(`Oracle storage download failed: ${response.status} ${response.statusText}`)
  }

  if (!response.body) {
    throw new Error("No response body from Oracle storage")
  }

  return response.body
}

/**
 * Delete a file from Oracle Object Storage
 * @param filename - The filename to delete
 */
export async function deleteFile(filename: string): Promise<void> {
  const deleteUrl = `${ORACLE_PAR_URL}${filename}`

  const response = await fetch(deleteUrl, {
    method: "DELETE",
  })

  if (!response.ok) {
    // If 404, it's already gone, so we can consider it success
    if (response.status === 404) return
    
    const errorText = await response.text().catch(() => "Unknown error")
    throw new Error(`Oracle storage delete failed: ${response.status} ${response.statusText} - ${errorText}`)
  }
}

/**
 * Get a signed URL for a file (in Oracle's case, just returns the PAR URL + filename)
 * @param filename - The filename
 * @returns The public URL
 */
export function getPublicUrl(filename: string): string {
  return `${ORACLE_PAR_URL}${filename}`
}



export default {
  uploadFile,
  downloadFile,
  getPublicUrl,
  deleteFile,
}
