import { getDb } from "@/lib/mongodb"
import { type NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const db = await getDb()
    const user = await db.collection("users").findOne({ email: email.toLowerCase() })

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash)

    if (!isValidPassword) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Update last login
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { last_login: new Date() } }
    )

    return NextResponse.json({ 
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.display_name || null,
      }
    })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
