// AutoCaps - Integration Service
// Location: AutoCapsPersonal/lib/integration-service.ts

import { getDb } from "./mongodb"
import { ObjectId } from "mongodb"
import type { IntegrationVideo } from "./types/integration"
import crypto from "crypto"

const SCHEDULER_API_URL = process.env.SCHEDULER_API_URL
const INTEGRATION_SECRET = process.env.INTEGRATION_JWT_SECRET!

export class IntegrationService {
  /**
   * Send callback with retry logic
   */
  private async sendCallback(
    callbackUrl: string,
    payload: any,
    maxRetries: number = 3
  ): Promise<boolean> {
    const signature = crypto
      .createHmac("sha256", INTEGRATION_SECRET)
      .update(JSON.stringify(payload))
      .digest("hex")

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(callbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Signature": signature
          },
          body: JSON.stringify(payload)
        })

        if (response.ok) {
          console.log(`[Integration] Callback sent successfully to ${callbackUrl}`)
          return true
        }

        console.warn(`[Integration] Callback failed (attempt ${attempt + 1}): ${response.status}`)
        
        // Wait before retry with exponential backoff
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      } catch (error) {
        console.error(`[Integration] Callback error (attempt ${attempt + 1}):`, error)
        
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
    }

    console.error(`[Integration] Callback failed after ${maxRetries} attempts`)
    return false
  }

  /**
   * Register integration video
   */
  async registerVideo(
    externalVideoId: string,
    videoUrl: string,
    callbackUrl: string,
    metadata?: any
  ): Promise<IntegrationVideo> {
    const db = await getDb()

    const integrationVideo: IntegrationVideo = {
      externalVideoId,
      externalSystem: "content_scheduler",
      videoUrl,
      status: "received",
      callbackUrl,
      callbackAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await db.collection("integration_videos").insertOne(integrationVideo)

    console.log(`[Integration] Registered video ${externalVideoId}`)

    return integrationVideo
  }

  /**
   * Link transcription to integration video
   */
  async linkTranscription(
    externalVideoId: string,
    uploadId: string,
    transcriptId: string
  ): Promise<void> {
    const db = await getDb()

    await db.collection("integration_videos").updateOne(
      { externalVideoId },
      {
        $set: {
          uploadId,
          transcriptId,
          status: "transcribing",
          updatedAt: new Date()
        }
      }
    )

    console.log(`[Integration] Linked transcription ${transcriptId} to video ${externalVideoId}`)
  }

  /**
   * Send transcription complete callback
   */
  async sendTranscriptionCallback(externalVideoId: string): Promise<void> {
    const db = await getDb()

    const integrationVideo = await db.collection<IntegrationVideo>("integration_videos")
      .findOne({ externalVideoId })

    if (!integrationVideo || !integrationVideo.transcriptId) {
      throw new Error(`Integration video or transcript not found: ${externalVideoId}`)
    }

    // Get transcript data
    const transcript = await db.collection("transcripts").findOne({
      _id: new ObjectId(integrationVideo.transcriptId)
    })

    if (!transcript) {
      throw new Error(`Transcript not found: ${integrationVideo.transcriptId}`)
    }

    const payload = {
      videoId: externalVideoId,
      transcriptionId: integrationVideo.transcriptId,
      status: "completed",
      segments: transcript.segments || [],
      language: transcript.language || "en",
      confidence: 0.95,
      completedAt: new Date().toISOString()
    }

    // Send callback
    const success = await this.sendCallback(integrationVideo.callbackUrl, payload)

    // Update integration video
    await db.collection("integration_videos").updateOne(
      { externalVideoId },
      {
        $set: {
          status: success ? "transcribed" : "failed",
          callbackAttempts: integrationVideo.callbackAttempts + 1,
          lastCallbackAt: new Date(),
          updatedAt: new Date()
        }
      }
    )

    if (!success) {
      throw new Error("Failed to send transcription callback")
    }
  }

  /**
   * Update transcription with corrections from Scheduler
   */
  async updateTranscription(
    externalVideoId: string,
    transcriptId: string,
    correctedSegments: any[]
  ): Promise<void> {
    const db = await getDb()

    // Update transcript in database
    await db.collection("transcripts").updateOne(
      { _id: new ObjectId(transcriptId) },
      {
        $set: {
          segments: correctedSegments,
          updated_at: new Date()
        }
      }
    )

    console.log(`[Integration] Updated transcription ${transcriptId} with corrections`)
  }

  /**
   * Link render job to integration video
   */
  async linkRenderJob(
    externalVideoId: string,
    jobId: string,
    renderOptions: any
  ): Promise<void> {
    const db = await getDb()

    await db.collection("integration_videos").updateOne(
      { externalVideoId },
      {
        $set: {
          jobId,
          renderOptions,
          status: "rendering",
          updatedAt: new Date()
        }
      }
    )

    console.log(`[Integration] Linked render job ${jobId} to video ${externalVideoId}`)
  }

  /**
   * Send render progress callback
   */
  async sendRenderProgressCallback(
    externalVideoId: string,
    progress: number
  ): Promise<void> {
    const db = await getDb()

    const integrationVideo = await db.collection<IntegrationVideo>("integration_videos")
      .findOne({ externalVideoId })

    if (!integrationVideo || !integrationVideo.jobId) {
      return // Silently skip if not found
    }

    const payload = {
      videoId: externalVideoId,
      renderId: integrationVideo.jobId,
      status: "rendering",
      progress,
      message: `Rendering... ${Math.round(progress * 100)}% complete`
    }

    // Send callback (don't throw on failure for progress updates)
    await this.sendCallback(integrationVideo.callbackUrl, payload, 1)
  }

  /**
   * Send render complete callback
   */
  async sendRenderCompleteCallback(externalVideoId: string): Promise<void> {
    const db = await getDb()

    const integrationVideo = await db.collection<IntegrationVideo>("integration_videos")
      .findOne({ externalVideoId })

    if (!integrationVideo || !integrationVideo.jobId) {
      throw new Error(`Integration video or job not found: ${externalVideoId}`)
    }

    // Get job data
    const job = await db.collection("jobs").findOne({
      _id: new ObjectId(integrationVideo.jobId)
    })

    if (!job || job.status !== "done") {
      throw new Error(`Job not found or not completed: ${integrationVideo.jobId}`)
    }

    const payload = {
      videoId: externalVideoId,
      renderId: integrationVideo.jobId,
      status: "completed",
      progress: 1.0,
      renderedVideoUrl: job.result?.downloadUrl || "",
      downloadUrl: job.result?.downloadUrl || "",
      completedAt: new Date().toISOString(),
      metadata: {
        duration: 0,
        fileSize: 0,
        resolution: "1920x1080"
      }
    }

    // Send callback
    const success = await this.sendCallback(integrationVideo.callbackUrl, payload)

    // Update integration video
    await db.collection("integration_videos").updateOne(
      { externalVideoId },
      {
        $set: {
          status: success ? "completed" : "failed",
          captionedUrl: job.result?.downloadUrl,
          callbackAttempts: integrationVideo.callbackAttempts + 1,
          lastCallbackAt: new Date(),
          updatedAt: new Date()
        }
      }
    )

    if (!success) {
      throw new Error("Failed to send render complete callback")
    }
  }

  /**
   * Send error callback
   */
  async sendErrorCallback(
    externalVideoId: string,
    type: "transcription" | "render",
    error: Error
  ): Promise<void> {
    const db = await getDb()

    const integrationVideo = await db.collection<IntegrationVideo>("integration_videos")
      .findOne({ externalVideoId })

    if (!integrationVideo) {
      return
    }

    const payload = type === "transcription" 
      ? {
          videoId: externalVideoId,
          transcriptionId: integrationVideo.transcriptId || "",
          status: "failed",
          error: {
            message: error.message,
            code: "TRANSCRIPTION_FAILED"
          }
        }
      : {
          videoId: externalVideoId,
          renderId: integrationVideo.jobId || "",
          status: "failed",
          progress: 0,
          error: {
            message: error.message,
            code: "RENDER_FAILED"
          }
        }

    await this.sendCallback(integrationVideo.callbackUrl, payload, 2)

    // Update status
    await db.collection("integration_videos").updateOne(
      { externalVideoId },
      {
        $set: {
          status: "failed",
          error: {
            message: error.message,
            code: type === "transcription" ? "TRANSCRIPTION_FAILED" : "RENDER_FAILED",
            occurredAt: new Date()
          },
          updatedAt: new Date()
        }
      }
    )
  }
}

// Export singleton
export const integrationService = new IntegrationService()
