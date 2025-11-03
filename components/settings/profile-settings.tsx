"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader } from "lucide-react"

interface ProfileSettingsProps {
  profile: any
  userEmail: string
}

export function ProfileSettings({ profile, userEmail }: ProfileSettingsProps) {
  const [displayName, setDisplayName] = useState(profile?.display_name || "")
  const [isSaving, setIsSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")

  const handleSave = async () => {
    setIsSaving(true)
    setSuccessMessage("")

    try {
      const response = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      })

      if (!response.ok) throw new Error("Failed to update profile")

      setSuccessMessage("Profile updated successfully")
      setTimeout(() => setSuccessMessage(""), 3000)
    } catch (error) {
      console.error("Update error:", error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>Update your profile details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Email Address</label>
          <Input type="email" value={userEmail} disabled className="bg-secondary" />
          <p className="text-xs text-muted-foreground mt-2">Email cannot be changed. Contact support for assistance.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Display Name</label>
          <Input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        {successMessage && (
          <div className="p-3 bg-green-100/10 border border-green-500/30 rounded-lg text-green-600 text-sm">
            {successMessage}
          </div>
        )}

        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
