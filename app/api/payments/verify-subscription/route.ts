import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { subscriptionId, razorpayPaymentId, razorpaySignature } = await request.json()

    // Update subscription status to active
    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "active",
        razorpay_subscription_id: razorpayPaymentId,
      })
      .eq("id", subscriptionId)

    if (error) {
      return NextResponse.json({ error: "Failed to verify subscription" }, { status: 500 })
    }

    // Update user's subscription tier
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("plan_id")
        .eq("id", subscriptionId)
        .single()

      await supabase.from("profiles").update({ subscription_tier: subscription?.plan_id }).eq("id", user.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Verification error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
