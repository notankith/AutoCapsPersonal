import type React from "react"
import { Sparkles } from "lucide-react"
import Link from "next/link"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center p-4">
      <div className="absolute top-8 left-8">
        <Link href="/" className="flex items-center gap-2 hover:opacity-75 transition-opacity">
          <Sparkles className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg">AutoCaps</span>
        </Link>
      </div>

      <div className="w-full max-w-md">{children}</div>

      <p className="text-muted-foreground text-sm mt-8 text-center">
        By using AutoCaps, you agree to our Terms of Service and Privacy Policy
      </p>
    </div>
  )
}
