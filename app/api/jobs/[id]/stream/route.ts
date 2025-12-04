import { getDb } from "@/lib/mongodb"
import { type NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  const { id } = await context.params

  // TODO: Get userId from JWT token instead of hardcoding
  const userId = "default-user"

  let job
  try {
    job = await db.collection("jobs").findOne({
      _id: new ObjectId(id),
    })
  } catch (error) {
    return NextResponse.json({ error: "Invalid job ID format" }, { status: 400 })
  }

  if (!job || job.user_id !== userId) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  // Use TextEncoder to create a proper TransformStream for SSE
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let lastSentProgress = -1
      let lastSentStatus: string | null = null
      let pollCount = 0
      const maxPolls = 1200 // 10 minutes at 500ms intervals

      try {
        const sendUpdate = (jobData: any) => {
          const progress = jobData.result?.progress ?? null
          const status = jobData.status

          // Send update if something changed
          if (progress !== lastSentProgress || status !== lastSentStatus) {
            const data = JSON.stringify({
              status,
              progress,
              hasDownloadUrl: !!jobData.result?.downloadUrl,
              downloadUrl: jobData.result?.downloadUrl ?? null,
              timestamp: new Date().toISOString(),
            })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            lastSentProgress = progress
            lastSentStatus = status
          }
        }

        // Send initial state
        sendUpdate(job)

        // Poll job status every 500ms for real-time updates
        const pollInterval = setInterval(async () => {
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval)
            controller.close()
            return
          }
          pollCount++

          try {
            const updatedJob = await db.collection("jobs").findOne({
              _id: new ObjectId(id),
            })

            if (!updatedJob) {
              clearInterval(pollInterval)
              controller.close()
              return
            }

            sendUpdate(updatedJob)

            // Close stream when job is done or failed
            if (updatedJob.status === "done" || updatedJob.status === "failed") {
              clearInterval(pollInterval)
              setTimeout(() => controller.close(), 100)
            }
          } catch (err) {
            console.error("[stream] Poll error", err)
            clearInterval(pollInterval)
            controller.close()
          }
        }, 500) // Poll every 500ms for real-time feel
      } catch (err) {
        console.error("[stream] Error", err)
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

