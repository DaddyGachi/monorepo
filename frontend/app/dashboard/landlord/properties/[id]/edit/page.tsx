"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PropertyListingForm } from "@/components/landlord/property-listing-form";
import { CollaborativeDraftEditor } from "@/components/properties/CollaborativeDraftEditor";
import {
  getLandlordProperty,
  updateLandlordProperty,
  type LandlordPropertyRecord,
} from "@/lib/landlordPropertiesApi";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import useAuthStore from "@/store/useAuthStore";

export default function EditPropertyPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const user = useAuthStore((state) => state.user);
  const [property, setProperty] = useState<LandlordPropertyRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLandlordProperty(id)
      .then((data) => {
        if (!cancelled) setProperty(data);
      })
      .catch((error) => {
        if (!cancelled) showErrorToast(error, "Failed to load property");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="mx-auto max-w-4xl p-8">
        <Link
          href="/dashboard/landlord/properties"
          className="mb-4 inline-flex items-center gap-2 font-bold hover:text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to properties
        </Link>
        <h1 className="mb-8 text-4xl font-bold">Edit Property</h1>

        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : property ? (
          <>
            {user && (
              <div className="mb-8">
                <CollaborativeDraftEditor
                  draftId={id}
                  currentUserId={user.id}
                  currentUserName={user.name || "Landlord"}
                  initialFields={{
                    title: property.title,
                    description: property.description ?? "",
                    address: property.address,
                    bedrooms: String(property.bedrooms),
                    bathrooms: String(property.bathrooms),
                  }}
                />
              </div>
            )}
            <PropertyListingForm
              mode="edit"
              initialProperty={property}
              submitLabel="Save changes"
              onSubmit={async (payload) => {
                try {
                  await updateLandlordProperty(id, payload);
                  showSuccessToast("Property updated.");
                  router.push("/dashboard/landlord/properties");
                } catch (error) {
                  showErrorToast(error, "Failed to update property");
                  throw error;
                }
              }}
            />
          </>
        ) : (
          <p className="text-muted-foreground">Property not found.</p>
        )}
      </div>
    </div>
  );
}
