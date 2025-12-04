import { NextResponse, type NextRequest } from "next/server"

/**
 * Middleware - Auth removed (Supabase replaced with MongoDB)
 * Add your own auth logic here if needed
 */
export async function middleware(request: NextRequest) {
  // Temporarily allow all requests - implement your own auth logic
  return NextResponse.next({ request })
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
