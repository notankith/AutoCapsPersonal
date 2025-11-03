import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { planId } = await request.json()

    // Get plan details
    const planPrices = {
      pro: 49900, // ₹499 in paise
      enterprise: 299900, // ₹2999 in paise
    }

    const planPrice = planPrices[planId as keyof typeof planPrices]
    if (!planPrice) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }

    // Get user profile for email
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single()

    // Create Razorpay subscription
    // This would call Razorpay API to create the subscription
    // For now, create a database record
    const { data: subscription, error: dbError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: user.id,
        plan_id: planId,
        status: "pending",
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .select()
      .single()

    if (dbError) {
      return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      userEmail: profile?.email || user.email,
      amount: planPrice,
      razorpayKey: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, // Safe to send from server
    })
  } catch (error) {
    console.error("Payment error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
