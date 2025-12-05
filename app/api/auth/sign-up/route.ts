import { getDb } from "@/lib/mongodb"
import { type NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { cookies } from "next/headers"

const JWT_SECRET = process.env.JWT_SECRET || process.env.WORKER_JWT_SECRET || "default-secret-key-change-me"

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
      last_login: new Date(),
    }

    const result = await db.collection("users").insertOne(newUser)

    // Create JWT token
    const token = jwt.sign(
      { 
        userId: result.insertedId.toString(),
        email: newUser.email 
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    )

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    })

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
