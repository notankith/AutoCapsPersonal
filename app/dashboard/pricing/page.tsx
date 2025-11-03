import { createClient } from "@/lib/supabase/server"
import { PricingPlans } from "@/components/pricing/pricing-plans"
import { PricingFeatures } from "@/components/pricing/pricing-features"

export default async function PricingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch user's current subscription
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user?.id)
    .eq("status", "active")
    .single()

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
