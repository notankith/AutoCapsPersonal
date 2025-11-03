import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, X } from "lucide-react"

export function PricingFeatures() {
  const features = [
    {
      category: "Video Processing",
      items: [
        { name: "Video uploads", free: "3/month", pro: "Unlimited", enterprise: "Unlimited" },
        { name: "Maximum video length", free: "30 min", pro: "Unlimited", enterprise: "Unlimited" },
        { name: "Video quality", free: "720p", pro: "4K", enterprise: "8K" },
        { name: "Processing speed", free: "Standard", pro: "Fast", enterprise: "Priority" },
      ],
    },
    {
      category: "Languages & Captions",
      items: [
        { name: "Languages supported", free: "1 (English)", pro: "50+", enterprise: "100+" },
        { name: "Auto-transcription", free: true, pro: true, enterprise: true },
        { name: "Translation", free: false, pro: true, enterprise: true },
        { name: "Speaker identification", free: false, pro: true, enterprise: true },
      ],
    },
    {
      category: "Features",
      items: [
        { name: "Custom captions", free: false, pro: true, enterprise: true },
        { name: "Caption styling", free: false, pro: true, enterprise: true },
        { name: "Batch processing", free: false, pro: true, enterprise: true },
        { name: "Custom branding", free: false, pro: true, enterprise: true },
      ],
    },
    {
      category: "Support & Storage",
      items: [
        { name: "Storage", free: "1 GB", pro: "100 GB", enterprise: "Unlimited" },
        { name: "Support", free: "Community", pro: "Email", enterprise: "Dedicated" },
        { name: "API access", free: false, pro: false, enterprise: true },
        { name: "Team members", free: "1", pro: "5", enterprise: "Unlimited" },
      ],
    },
  ]

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold">Feature Comparison</h2>
      {features.map((section) => (
        <Card key={section.category}>
          <CardHeader>
            <CardTitle className="text-xl">{section.category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold">Feature</th>
                    <th className="text-center py-3 px-4 font-semibold">Free</th>
                    <th className="text-center py-3 px-4 font-semibold">Pro</th>
                    <th className="text-center py-3 px-4 font-semibold">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-3 px-4">{item.name}</td>
                      <td className="text-center py-3 px-4">
                        {typeof item.free === "boolean" ? (
                          item.free ? (
                            <Check className="w-5 h-5 text-primary mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="text-muted-foreground">{item.free}</span>
                        )}
                      </td>
                      <td className="text-center py-3 px-4">
                        {typeof item.pro === "boolean" ? (
                          item.pro ? (
                            <Check className="w-5 h-5 text-primary mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span>{item.pro}</span>
                        )}
                      </td>
                      <td className="text-center py-3 px-4">
                        {typeof item.enterprise === "boolean" ? (
                          item.enterprise ? (
                            <Check className="w-5 h-5 text-primary mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span>{item.enterprise}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
