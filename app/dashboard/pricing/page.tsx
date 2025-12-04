import { getDb } from "@/lib/mongodb"
import { PricingPlans } from "@/components/pricing/pricing-plans"
import { PricingFeatures } from "@/components/pricing/pricing-features"

export default async function PricingPage() {
  // TODO: Get user from session/JWT token
  const userId = "default-user" // Temporary until auth is implemented

  const db = await getDb()
  
  // Fetch user's current subscription
  const subscription = await db.collection("subscriptions").findOne({ 
    user_id: userId,
    status: "active" 
  })

  return (
    <div className="p-8 space-y-12">
      <div>
        <h1 className="text-4xl font-bold">Upgrade Your Plan</h1>
        <p className="text-muted-foreground mt-2">Choose the perfect plan for your video captioning needs</p>
      </div>

      <PricingPlans currentPlan={subscription?.plan_id} />
      <PricingFeatures />
    </div>
  )
}
