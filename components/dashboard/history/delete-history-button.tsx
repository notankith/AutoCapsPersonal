"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Trash2, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export function DeleteHistoryButton() {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete ALL history? This action cannot be undone. All videos, captions, and renders will be permanently deleted.")) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch("/api/history/purge", {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete history")
      }

      // Refresh the page to show empty history
      router.refresh()
    } catch (error) {
      console.error("Error deleting history:", error)
      alert("Failed to delete history. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Button 
      variant="destructive" 
      onClick={handleDelete} 
      disabled={isDeleting}
      className="gap-2"
    >
      {isDeleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      Delete All History
    </Button>
  )
}
