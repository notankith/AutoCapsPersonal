import { getDb } from "@/lib/mongodb"
import { type NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import bcrypt from "bcryptjs"

export async function POST(request: NextRequest) {
  try {
    const { email, password, displayName } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    const db = await getDb()
    
    // Check if user already exists
    const existingUser = await db.collection("users").findOne({ 
      email: email.toLowerCase() 
    })

    if (existingUser) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 })
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10)

    // Create user
    const newUser = {
      email: email.toLowerCase(),
      password_hash,
      display_name: displayName || null,
      created_at: new Date(),
      updated_at: new Date(),
      last_login: null,
    }

    const result = await db.collection("users").insertOne(newUser)

    return NextResponse.json({
      success: true,
      message: "Account created successfully",
      user: {
        id: result.insertedId.toString(),
        email: newUser.email,
        displayName: newUser.display_name,
      }
    })
  } catch (error) {
    console.error("Sign up error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
