"use client"

import { Upload, FileText, Download } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export function QuickActions() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Link href="/dashboard/upload">
        <Button className="w-full h-24 flex-col gap-2 text-base bg-primary hover:bg-primary/90">
          <Upload className="w-6 h-6" />
          Upload Video
        </Button>
      </Link>
      <Button className="w-full h-24 flex-col gap-2 text-base variant-outline">
        <FileText className="w-6 h-6" />
        Recent Projects
      </Button>
      <Button className="w-full h-24 flex-col gap-2 text-base variant-outline">
        <Download className="w-6 h-6" />
        Export Video
      </Button>
    </div>
  )
}
