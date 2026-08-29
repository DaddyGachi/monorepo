"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PropertyListingForm } from "@/components/landlord/property-listing-form";
import { CollaborativeDraftEditor } from "@/components/properties/CollaborativeDraftEditor";
import { createLandlordProperty } from "@/lib/landlordPropertiesApi";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import useAuthStore from "@/store/useAuthStore";

export default function NewPropertyPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

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
        <h1 className="mb-2 text-4xl font-bold">Add New Property</h1>
        <p className="mb-8 text-muted-foreground">
          Complete all sections — at least 3 photos and valid pricing are required.
        </p>

        {user && (
          <div className="mb-8">
            <CollaborativeDraftEditor
              draftId="new"
              currentUserId={user.id}
              currentUserName={user.name || "Landlord"}
            />
          </div>
        )}

        <PropertyListingForm
          mode="create"
          submitLabel="Submit for review"
          onSubmit={async (payload) => {
            try {
              await createLandlordProperty(payload);
              showSuccessToast("Property submitted for review.");
              router.push("/dashboard/landlord/properties");
            } catch (error) {
              showErrorToast(error, "Failed to create property");
              throw error;
            }
          }}
        />
      </div>
    </div>
  );
}
