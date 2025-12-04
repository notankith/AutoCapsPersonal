import type React from "react"
import { Sidebar } from "@/components/dashboard/sidebar"

/**
 * Dashboard Layout
 * 
 * TODO: Implement proper auth check with MongoDB/JWT
 * Currently allows all access - auth checking should be done in middleware
 * or by checking localStorage/cookies for valid session
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // TODO: Add auth verification here
  // For now, client-side auth check in components or middleware

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
