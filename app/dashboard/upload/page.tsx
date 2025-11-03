import { VideoUploadForm } from "@/components/upload/video-upload-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function UploadPage() {
  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Upload Video</h1>
        <p className="text-muted-foreground mt-2">Upload your video and let AutoCaps generate captions automatically</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Video File</CardTitle>
              <CardDescription>MP4, WebM, or MOV • Max 2GB</CardDescription>
            </CardHeader>
            <CardContent>
              <VideoUploadForm />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Upload HD videos for better accuracy</p>
              <p>• Clear audio produces better captions</p>
              <p>• Processing time varies by video length</p>
              <p>• You can edit captions after processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Supported Formats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>MP4 (H.264)</p>
              <p>WebM</p>
              <p>MOV</p>
              <p>AVI</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
