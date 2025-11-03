"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Loader } from "lucide-react"

export function NotificationSettings() {
  const [settings, setSettings] = useState({
    emailOnCompletion: true,
    emailOnError: true,
    emailOnNewFeatures: false,
    emailOnPromotions: false,
  })
  const [isSaving, setIsSaving] = useState(false)

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (!response.ok) throw new Error("Failed to save settings")
      setIsSaving(false)
    } catch (error) {
      console.error("Save error:", error)
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Manage when you receive email notifications</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {[
            {
              key: "emailOnCompletion",
              label: "Video Processing Complete",
              description: "Get notified when your videos finish processing",
            },
            {
              key: "emailOnError",
              label: "Processing Errors",
              description: "Alert me if something goes wrong",
            },
            {
              key: "emailOnNewFeatures",
              label: "New Features",
              description: "Learn about new AutoCaps features",
            },
            {
              key: "emailOnPromotions",
              label: "Promotions & Offers",
              description: "Receive special offers and promotions",
            },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Switch
                checked={settings[item.key as keyof typeof settings]}
                onCheckedChange={() => handleToggle(item.key as keyof typeof settings)}
              />
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Preferences"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
