"use client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { User, Bell, Lock, CreditCard } from "lucide-react"
import { ProfileSettings } from "./profile-settings"
import { NotificationSettings } from "./notification-settings"
import { SecuritySettings } from "./security-settings"
import { BillingSettings } from "./billing-settings"

interface SettingsTabsProps {
  user: any
  profile: any
  subscription: any
}

export function SettingsTabs({ user, profile, subscription }: SettingsTabsProps) {
  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList className="grid w-full md:w-fit grid-cols-4">
        <TabsTrigger value="profile" className="gap-2">
          <User className="w-4 h-4" />
          <span className="hidden md:inline">Profile</span>
        </TabsTrigger>
        <TabsTrigger value="notifications" className="gap-2">
          <Bell className="w-4 h-4" />
          <span className="hidden md:inline">Notifications</span>
        </TabsTrigger>
        <TabsTrigger value="security" className="gap-2">
          <Lock className="w-4 h-4" />
          <span className="hidden md:inline">Security</span>
        </TabsTrigger>
        <TabsTrigger value="billing" className="gap-2">
          <CreditCard className="w-4 h-4" />
          <span className="hidden md:inline">Billing</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="mt-6">
        <ProfileSettings profile={profile} userEmail={user.email} />
      </TabsContent>

      <TabsContent value="notifications" className="mt-6">
        <NotificationSettings />
      </TabsContent>

      <TabsContent value="security" className="mt-6">
        <SecuritySettings userEmail={user.email} />
      </TabsContent>

      <TabsContent value="billing" className="mt-6">
        <BillingSettings subscription={subscription} />
      </TabsContent>
    </Tabs>
  )
}
