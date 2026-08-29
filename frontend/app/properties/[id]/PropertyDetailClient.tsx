import PropertyPageContent from "@/components/properties/PropertyPageContent"

type PropertyDetailClientProps = {
  propertyId: string
}

export default function PropertyDetailClient({
  propertyId,
}: PropertyDetailClientProps) {
  return <PropertyPageContent propertyId={propertyId} />
}
