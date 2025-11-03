"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader, ArrowLeft } from "lucide-react"

interface RazorpayCheckoutProps {
  planId: string
  onCancel: () => void
}

declare global {
  interface Window {
    Razorpay: any
  }
}

export function RazorpayCheckout({ planId, onCancel }: RazorpayCheckoutProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [razorpayKey, setRazorpayKey] = useState<string>("")

  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.async = true
    document.body.appendChild(script)

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [])

  const handleCheckout = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/payments/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setRazorpayKey(data.razorpayKey)

      const options = {
        key: data.razorpayKey,
        subscription_id: data.subscriptionId,
        name: "AutoCaps.ai",
        description: `Upgrade to ${planId} plan`,
        prefill: {
          email: data.userEmail,
        },
        handler: async (response: any) => {
          // Mark subscription as active
          await fetch("/api/payments/verify-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscriptionId: data.subscriptionId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          })

          onCancel() // Close and refresh
        },
        theme: {
          color: "#6366f1",
        },
      }

      new window.Razorpay(options).open()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete Your Upgrade</CardTitle>
          <CardDescription>Secure payment powered by Razorpay</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="bg-secondary/50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">Plan</p>
            <p className="text-lg font-semibold capitalize">{planId}</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-2 bg-transparent" onClick={onCancel} disabled={isLoading}>
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button className="flex-1 gap-2" onClick={handleCheckout} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Pay Now"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
