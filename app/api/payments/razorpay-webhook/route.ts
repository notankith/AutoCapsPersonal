import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = body

    // Verify signature
    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    shasum.update(JSON.stringify(body))
    const signature = shasum.digest("hex")

    if (signature !== razorpay_signature) {
      console.error("[v0] Invalid Razorpay signature")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    // Update subscription in database
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        status: "active",
        razorpay_payment_id,
        razorpay_subscription_id,
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .eq("razorpay_subscription_id", razorpay_subscription_id)

    if (updateError) {
      console.error("[v0] Subscription update error:", updateError)
      return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 })
    }

    // Log the payment event
    const { error: logError } = await supabase.from("payment_logs").insert({
      razorpay_payment_id,
      razorpay_subscription_id,
      status: "completed",
      event_type: "payment.authorized",
      payload: body,
    })

    if (logError) {
      console.error("[v0] Payment log error:", logError)
    }

    return NextResponse.json({ success: true, message: "Payment verified" })
  } catch (error) {
    console.error("[v0] Webhook error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
