import { getDb } from "@/lib/mongodb"
import { type NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"

export async function POST(request: NextRequest) {
  try {
    const { email, currentPassword, newPassword } = await request.json()

    if (!email || !currentPassword || !newPassword) {
      return NextResponse.json({ error: "Email, current password, and new password are required" }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 })
    }

    const db = await getDb()
    const user = await db.collection("users").findOne({ email: email.toLowerCase() })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash)

    if (!isValidPassword) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 })
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10)

    // Update password
    await db.collection("users").updateOne(
      { _id: user._id },
      { 
        $set: { 
          password_hash: newPasswordHash,
          updated_at: new Date()
        } 
      }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Password change error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
