// AutoCaps - Integration Auth Middleware
// Location: AutoCapsPersonal/lib/integration-auth.ts

import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"

const INTEGRATION_SECRET = process.env.INTEGRATION_JWT_SECRET!

interface IntegrationToken {
  iss: string
  aud: string
  exp: number
  iat: number
  jti: string
}

export function verifyIntegrationToken(request: NextRequest): IntegrationToken | null {
  const authHeader = request.headers.get("authorization")
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null
  }

  const token = authHeader.substring(7)

  try {
    const decoded = jwt.verify(token, INTEGRATION_SECRET) as IntegrationToken

    // Verify issuer and audience
    if (decoded.iss !== "content_scheduler" || decoded.aud !== "autocaps") {
      console.error("[IntegrationAuth] Invalid issuer or audience")
      return null
    }

    return decoded
  } catch (error) {
    console.error("[IntegrationAuth] Token verification failed:", error)
    return null
  }
}
