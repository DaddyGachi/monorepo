import type React from "react"
import {
  Wifi,
  Car,
  Shield,
  Dumbbell,
  TreePine,
  Wind,
  Utensils,
  Tv,
  Waves,
  Check,
} from "lucide-react"
import { AmenitiesLegend } from "@/components/properties/AmenitiesLegend"

interface PropertyAmenitiesProps {
  features: string[]
}

const featureIcons: Record<string, React.ElementType> = {
  "24/7 Power Supply": Wind,
  "24/7 Power": Wind,
  "Fully Fitted Kitchen": Utensils,
  "Modern Kitchen": Utensils,
  "Gourmet Kitchen": Utensils,
  "Air Conditioning": Wind,
  "Swimming Pool": Waves,
  "Infinity Pool": Waves,
  "Gym Access": Dumbbell,
  "Gym & Spa": Dumbbell,
  "Secure Parking": Car,
  "Spacious Parking": Car,
  "Underground Parking": Car,
  "Parking Space": Car,
  "Double Garage": Car,
  Garage: Car,
  "CCTV Security": Shield,
  "24/7 Security": Shield,
  "Security Gate": Shield,
  "Fiber Internet Ready": Wifi,
  "Smart Home System": Wifi,
  "Smart Home": Wifi,
  "Private Garden": TreePine,
  "Garden Space": TreePine,
  Backyard: TreePine,
  "Home Cinema": Tv,
  "Private Cinema": Tv,
  Balcony: TreePine,
  "Rooftop Lounge": TreePine,
}

export function PropertyAmenities({ features }: PropertyAmenitiesProps) {
  return (
    <>
      <div className="border-3 border-foreground bg-card p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] sm:p-6">
        <h2 className="font-mono text-lg font-bold mb-3 sm:text-xl sm:mb-4">
          Features & Amenities
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {features.map((feature, index) => {
            const IconComponent = featureIcons[feature] || Check
            return (
              <div
                key={`${feature}-${index}`}
                className="flex items-center gap-3 border-2 border-foreground bg-muted p-3"
                role="listitem"
                aria-label={`${feature} amenity`}
              >
                <div className="flex h-8 w-8 items-center justify-center bg-secondary border-2 border-foreground">
                  <IconComponent
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                </div>
                <span className="font-medium">{feature}</span>
              </div>
            )
          })}
        </div>
      </div>
      <AmenitiesLegend />
    </>
  )
}
