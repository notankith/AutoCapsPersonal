# Authentication Migration - MongoDB Implementation

## ✅ Completed Changes

### Updated Auth Routes

1. **`/api/auth/login`** - MongoDB-based login with bcrypt password verification
2. **`/api/auth/sign-up`** - User registration with password hashing
3. **`/api/auth/logout`** - Placeholder for session clearing
4. **`/api/auth/change-password`** - Password update with verification

### Dependencies Added

```json
{
  "dependencies": {
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6"
  }
}
```

## Database Schema

### `users` Collection

```typescript
{
  _id: ObjectId,
  email: string,              // Lowercase, unique
  password_hash: string,      // Bcrypt hash
  display_name: string | null,
  created_at: Date,
  updated_at: Date,
  last_login: Date | null
}
```

**Create index for performance:**
```javascript
db.users.createIndex({ email: 1 }, { unique: true })
```

## API Endpoints

### POST `/api/auth/sign-up`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "displayName": "John Doe"  // Optional
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "displayName": "John Doe"
  }
}
```

**Response (Error):**
```json
{
  "error": "Email already registered"
}
```

### POST `/api/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "displayName": "John Doe"
  }
}
```

**Response (Error):**
```json
{
  "error": "Invalid email or password"
}
```

### POST `/api/auth/change-password`

**Request:**
```json
{
  "email": "user@example.com",
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

**Response (Success):**
```json
{
  "success": true
}
```

### POST `/api/auth/logout`

**Response:**
```json
{
  "success": true
}
```

## Client-Side Session Management

Since Supabase auth is removed, you need to implement client-side session storage:

### After Login (Client-Side)

```typescript
// In your login component
const response = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
})

const data = await response.json()

if (data.success) {
  // Store user data in localStorage
  localStorage.setItem("user", JSON.stringify(data.user))
  
  // Redirect to dashboard
  router.push("/dashboard")
}
```

### Check Auth Status

```typescript
// In protected pages/components
const user = localStorage.getItem("user")

if (!user) {
  router.push("/auth/login")
}
```

### Logout

```typescript
const handleLogout = async () => {
  await fetch("/api/auth/logout", { method: "POST" })
  localStorage.removeItem("user")
  router.push("/auth/login")
}
```

## Security Improvements Needed

### 🔴 Current Limitations (TODO)

1. **No JWT Tokens** - Using localStorage is vulnerable to XSS
2. **No Session Validation** - Server doesn't verify logged-in user
3. **No Protected Routes** - Middleware allows all requests

### 🟢 Recommended Implementation

1. **Add JWT Token Generation:**
   ```typescript
   import jwt from "jsonwebtoken"
   
   const token = jwt.sign(
     { userId: user._id, email: user.email },
     process.env.JWT_SECRET!,
     { expiresIn: "7d" }
   )
   ```

2. **Store Token in HttpOnly Cookie:**
   ```typescript
   response.cookies.set("auth_token", token, {
     httpOnly: true,
     secure: process.env.NODE_ENV === "production",
     sameSite: "lax",
     maxAge: 60 * 60 * 24 * 7 // 7 days
   })
   ```

3. **Update Middleware to Verify Token:**
   ```typescript
   import jwt from "jsonwebtoken"
   
   export async function middleware(request: NextRequest) {
     const token = request.cookies.get("auth_token")?.value
     
     if (request.nextUrl.pathname.startsWith("/dashboard")) {
       if (!token) {
         return NextResponse.redirect(new URL("/auth/login", request.url))
       }
       
       try {
         jwt.verify(token, process.env.JWT_SECRET!)
       } catch {
         return NextResponse.redirect(new URL("/auth/login", request.url))
       }
     }
     
     return NextResponse.next()
   }
   ```

4. **Add Helper to Get Current User:**
   ```typescript
   // lib/auth.ts
   import jwt from "jsonwebtoken"
   import { cookies } from "next/headers"
   import { getDb } from "./mongodb"
   import { ObjectId } from "mongodb"
   
   export async function getCurrentUser() {
     const cookieStore = await cookies()
     const token = cookieStore.get("auth_token")?.value
     
     if (!token) return null
     
     try {
       const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
       const db = await getDb()
       const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.userId) })
       return user
     } catch {
       return null
     }
   }
   ```

## Installation

Run to install new dependencies:

```bash
npm install
# or
pnpm install
```

This will install:
- `bcryptjs@^2.4.3`
- `@types/bcryptjs@^2.4.6`

## Testing

1. **Sign Up:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123","displayName":"Test User"}'
   ```

2. **Login:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   ```

3. **Change Password:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/change-password \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","currentPassword":"test123","newPassword":"newpass123"}'
   ```

## Migration Checklist

- [x] Updated login route to use MongoDB + bcrypt
- [x] Updated sign-up route with password hashing
- [x] Updated logout route (placeholder)
- [x] Updated change-password route
- [x] Added bcryptjs dependencies
- [ ] Implement JWT token generation (recommended)
- [ ] Implement secure cookie storage (recommended)
- [ ] Update middleware with auth verification (recommended)
- [ ] Update client-side auth state management
- [ ] Test all auth flows

## Notes

- Passwords are hashed with bcrypt (10 rounds)
- Email addresses are stored in lowercase
- Last login timestamp is tracked
- No email verification implemented (TODO if needed)
- Password reset not implemented (TODO if needed)
