import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Mail } from "lucide-react"

export default function VerifyEmailPage() {
  return (
    <Card className="border-0 shadow-lg text-center">
      <CardHeader className="space-y-2">
        <div className="flex justify-center mb-4">
          <div className="bg-primary/10 p-4 rounded-full">
            <Mail className="w-8 h-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl">Check your email</CardTitle>
        <CardDescription>We&apos;ve sent a confirmation link</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-muted-foreground">
          Click the link in your email to verify your account and get started with AutoCaps.
        </p>
        <Link href="/auth/login">
          <Button className="w-full">Back to Login</Button>
        </Link>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive the email? Check your spam folder or contact support.
        </p>
      </CardContent>
    </Card>
  )
}
