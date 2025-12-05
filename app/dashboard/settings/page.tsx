import { getDb } from "@/lib/mongodb"
import { SettingsTabs } from "@/components/settings/settings-tabs"
import { getCurrentUser } from "@/lib/auth"
import { ObjectId } from "mongodb"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect("/auth/login")
  }

  const db = await getDb()
  
  // Fetch user profile and subscription
  const user = await db.collection("users").findOne({ _id: new ObjectId(currentUser.userId) })
  
  if (!user) {
    redirect("/auth/login")
  }

  // Map user data to profile format expected by components
  // We store display_name directly on user now
  const serializedUser = {
    ...user,
    _id: user._id.toString(),
    created_at: user.created_at?.toISOString(),
    updated_at: user.updated_at?.toISOString(),
    last_login: user.last_login?.toISOString(),
  }

  const profile = {
    display_name: user.display_name,
    ...serializedUser
  }

  const subscription = await db.collection("subscriptions").findOne({ 
    user_id: currentUser.userId,
    status: "active" 
  }).catch(() => null)

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account and preferences</p>
      </div>

      <SettingsTabs user={serializedUser} profile={profile} subscription={subscription} />
    </div>
  )
}
