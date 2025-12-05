// AutoCaps - Integration Types
// Location: AutoCapsPersonal/lib/types/integration.ts

export interface IntegrationVideo {
  _id?: any
  externalVideoId: string
  externalSystem: "content_scheduler"
  
  // AutoCaps IDs
  uploadId?: string
  transcriptId?: string
  jobId?: string
  
  // URLs
  videoUrl: string
  captionedUrl?: string
  
  // Status
  status: "received" | "transcribing" | "transcribed" | "rendering" | "completed" | "failed"
  
  // Callback
  callbackUrl: string
  callbackAttempts: number
  lastCallbackAt?: Date
  
  // Data
  transcription?: any
  renderOptions?: any
  
  // Error tracking
  error?: {
    message: string
    code: string
    occurredAt: Date
  }
  
  createdAt: Date
  updatedAt: Date
}

export interface TranscribeRequest {
  videoId: string
  videoUrl: string
  callbackUrl: string
  metadata?: {
    uploadedBy?: string
    filename?: string
    duration?: number
  }
}

export interface UpdateTranscriptionRequest {
  videoId: string
  transcriptionId: string
  correctedSegments: Array<{
    id: string
    start: number
    end: number
    text: string
    words?: Array<{
      text: string
      start: number
      end: number
    }>
  }>
}

export interface RenderRequest {
  videoId: string
  transcriptionId: string
  callbackUrl: string
  renderOptions?: {
    template?: string
    resolution?: string
    customStyles?: any
  }
}
