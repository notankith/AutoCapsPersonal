import { Button } from "@/components/ui/button"
import { Check, Play, Zap, Globe, Sparkles, ArrowRight } from "lucide-react"
import Link from "next/link"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">AutoCaps</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/auth/sign-up">
              <Button className="bg-primary hover:bg-primary/90">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 py-24">
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-balance leading-tight">
            Generate Captions in Seconds, <span className="text-primary">Not Hours</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            Powered by AI, AutoCaps transforms your videos with accurate captions, multi-language support, and
            professional-grade quality.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Link href="/auth/sign-up">
              <Button size="lg" className="gap-2">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="gap-2 bg-transparent">
              <Play className="w-4 h-4" />
              Watch Demo
            </Button>
          </div>
        </div>

        {/* Hero Image */}
        <div className="bg-card border border-border rounded-xl p-8 min-h-96 flex items-center justify-center overflow-hidden">
          <img src="/video-editing-interface-with-captions.jpg" alt="AutoCaps video editor interface" className="w-full rounded-lg" />
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Powerful Features for Creators</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Everything you need to caption, translate, and export professional videos
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: Zap,
              title: "Lightning Fast",
              description: "Process videos 10x faster with our optimized AI engine",
            },
            {
              icon: Globe,
              title: "Multi-Language",
              description: "Transcribe and translate to 50+ languages automatically",
            },
            {
              icon: Check,
              title: "Custom Captions",
              description: "Edit, style, and position captions exactly how you want",
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-xl p-8 hover:border-primary/50 transition-colors"
            >
              <feature.icon className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="max-w-7xl mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              name: "Free",
              price: "₹0",
              features: ["Up to 3 videos/month", "720p quality", "English only", "Community support"],
            },
            {
              name: "Pro",
              price: "₹499",
              features: ["Unlimited videos", "4K quality", "50+ languages", "Priority support", "Custom branding"],
              highlighted: true,
            },
            {
              name: "Enterprise",
              price: "Custom",
              features: ["Everything in Pro", "API access", "Dedicated support", "Custom integrations"],
            },
          ].map((plan, i) => (
            <div
              key={i}
              className={`border rounded-xl p-8 transition-all ${
                plan.highlighted
                  ? "bg-primary text-primary-foreground border-primary shadow-lg scale-105"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <p className="text-3xl font-bold mb-6">
                {plan.price}
                <span className="text-sm">/month</span>
              </p>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex gap-2">
                    <Check className="w-5 h-5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button className="w-full" variant={plan.highlighted ? "secondary" : "outline"}>
                Get Started
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary text-primary-foreground py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to Transform Your Videos?</h2>
          <p className="text-lg mb-8 opacity-90">
            Join thousands of creators already using AutoCaps to grow their audience
          </p>
          <Link href="/auth/sign-up">
            <Button size="lg" variant="secondary" className="gap-2">
              Start Your Free Trial <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2025 AutoCaps.ai. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
