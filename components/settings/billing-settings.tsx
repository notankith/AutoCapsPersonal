"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditCard, Download } from "lucide-react"
import Link from "next/link"

interface BillingSettingsProps {
  subscription: any
}

export function BillingSettings({ subscription }: BillingSettingsProps) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>Manage your subscription</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription ? (
            <>
              <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                <div className="flex items-center gap-4">
                  <CreditCard className="w-8 h-8 text-primary" />
                  <div>
                    <p className="font-semibold capitalize">{subscription.plan_id} Plan</p>
                    <p className="text-sm text-muted-foreground">Active</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-green-100/20 text-green-600 text-sm font-medium">
                  Active
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Renews on</p>
                  <p className="font-semibold">{formatDate(subscription.current_period_end)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Billing cycle</p>
                  <p className="font-semibold">Monthly</p>
                </div>
              </div>

              <Button variant="outline" className="w-full bg-transparent">
                Manage Subscription
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">You are on the free plan.</p>
              <Link href="/dashboard/pricing">
                <Button className="w-full">View Upgrade Options</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>View and download your invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { date: "Dec 1, 2024", amount: "₹499", status: "Paid" },
              { date: "Nov 1, 2024", amount: "₹499", status: "Paid" },
            ].map((invoice, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="font-medium">{invoice.date}</p>
                  <p className="text-sm text-muted-foreground">{invoice.amount}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded text-xs font-medium bg-green-100/20 text-green-600">
                    {invoice.status}
                  </span>
                  <Button size="sm" variant="outline" className="gap-2 bg-transparent">
                    <Download className="w-4 h-4" />
                    Invoice
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
