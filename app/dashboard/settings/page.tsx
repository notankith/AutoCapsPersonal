import { getDb } from "@/lib/mongodb"
import { SettingsTabs } from "@/components/settings/settings-tabs"

export default async function SettingsPage() {
  // TODO: Get user from session/JWT token
  const userId = "default-user" // Temporary until auth is implemented

  const db = await getDb()
  
  // Fetch user profile and subscription
  const user = await db.collection("users").findOne({ _id: userId as any })
  const profile = await db.collection("profiles").findOne({ user_id: userId })
  const subscription = await db.collection("subscriptions").findOne({ 
    user_id: userId,
    status: "active" 
  })

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account and preferences</p>
      </div>

      <SettingsTabs user={user} profile={profile} subscription={subscription} />
    </div>
  )
}
