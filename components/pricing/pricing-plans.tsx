"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, Zap } from "lucide-react"
import { useState } from "react"
import { RazorpayCheckout } from "./razorpay-checkout"

interface Plan {
  id: string
  name: string
  price: number
  period: "monthly" | "annual"
  description: string
  features: string[]
  highlighted?: boolean
}

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "monthly",
    description: "Perfect for getting started",
    features: ["Up to 3 videos/month", "720p quality", "English language only", "Community support", "1 GB storage"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 499,
    period: "monthly",
    description: "For active content creators",
    features: [
      "Unlimited videos",
      "4K quality",
      "50+ languages",
      "Priority email support",
      "100 GB storage",
      "Custom branding",
      "Caption styling",
    ],
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 2999,
    period: "monthly",
    description: "For teams and studios",
    features: [
      "Everything in Pro",
      "Unlimited storage",
      "API access",
      "Dedicated support",
      "Custom integrations",
      "Advanced analytics",
      "Team collaboration",
      "White-label options",
    ],
  },
]

interface PricingPlansProps {
  currentPlan?: string
}

export function PricingPlans({ currentPlan }: PricingPlansProps) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  if (selectedPlan && selectedPlan !== "free") {
    return <RazorpayCheckout planId={selectedPlan} onCancel={() => setSelectedPlan(null)} />
  }

  return (
    <div className="grid md:grid-cols-3 gap-8">
      {plans.map((plan) => (
        <Card
          key={plan.id}
          className={`transition-all ${
            plan.highlighted ? "border-primary shadow-lg scale-105 md:scale-100" : ""
          } ${currentPlan === plan.id ? "ring-2 ring-primary" : ""}`}
        >
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </div>
              {plan.highlighted && (
                <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Popular
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="text-4xl font-bold">
                ₹{plan.price}
                <span className="text-lg text-muted-foreground font-normal">/month</span>
              </div>
            </div>

            <ul className="space-y-3">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            {currentPlan === plan.id ? (
              <Button className="w-full" disabled>
                Current Plan
              </Button>
            ) : plan.id === "free" ? (
              <Button variant="outline" className="w-full bg-transparent">
                Continue with Free
              </Button>
            ) : plan.id === "enterprise" ? (
              <Button
                variant={plan.highlighted ? "default" : "outline"}
                className="w-full"
                onClick={() => alert("Contact sales for Enterprise plan")}
              >
                Contact Sales
              </Button>
            ) : (
              <Button
                variant={plan.highlighted ? "default" : "outline"}
                className="w-full"
                onClick={() => setSelectedPlan(plan.id)}
              >
                Upgrade to {plan.name}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
