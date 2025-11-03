"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, Video, Clock, TrendingUp } from "lucide-react"

interface StatsGridProps {
  subscription_tier?: string
}

export function StatsGrid({ subscription_tier }: StatsGridProps) {
  const stats = [
    {
      title: "Videos Processed",
      value: "12",
      icon: Video,
      subtext: "3 this month",
    },
    {
      title: "Total Minutes",
      value: "245",
      icon: Clock,
      subtext: "+32 this week",
    },
    {
      title: "Storage Used",
      value: "8.5 GB",
      icon: BarChart3,
      subtext: "of 100 GB",
    },
    {
      title: "Plan",
      value: subscription_tier === "pro" ? "Pro" : "Free",
      icon: TrendingUp,
      subtext: subscription_tier === "pro" ? "Unlimited videos" : "Upgrade available",
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <stat.icon className="w-4 h-4" />
              {stat.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stat.value}</div>
            <p className="text-sm text-muted-foreground mt-1">{stat.subtext}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
