"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { apiPost } from "@/lib/api"
import { showSuccessToast, showErrorToast } from "@/lib/toast"

interface PropertyReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
}

export function PropertyReportDialog({
  open,
  onOpenChange,
  propertyId,
}: PropertyReportDialogProps) {
  const [reportCategory, setReportCategory] = useState("")
  const [reportDetails, setReportDetails] = useState("")
  const [reportSubmitted, setReportSubmitted] = useState(false)
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)

  const handleReportSubmit = async () => {
    if (!reportCategory || !reportDetails.trim()) return

    setIsSubmittingReport(true)

    try {
      const response = await apiPost<{ success: boolean; reportId: string }>(
        "/api/property-issue-reports",
        {
          propertyId,
          reportCategory,
          reportDetails,
        }
      )

      if (response.success) {
        setReportSubmitted(true)
        showSuccessToast("Report submitted successfully!")

        setTimeout(() => {
          onOpenChange(false)
          setReportSubmitted(false)
          setReportCategory("")
          setReportDetails("")
        }, 2000)
      }
    } catch (error) {
      showErrorToast(error, "Failed to submit report. Please try again.")
    } finally {
      setIsSubmittingReport(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-3 border-foreground shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] sm:max-w-md">
        {reportSubmitted ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-3 border-foreground bg-secondary">
              <Check className="h-8 w-8 text-foreground" />
            </div>
            <h3 className="font-mono text-xl font-bold mb-2">
              Report Submitted
            </h3>
            <p className="text-sm text-muted-foreground">
              Thank you for helping keep our marketplace safe. We&apos;ll review
              this report shortly.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono text-xl font-bold">
                Report Listing
              </DialogTitle>
              <DialogDescription>
                Help us maintain a trustworthy marketplace by reporting
                suspicious or incorrect listings.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category" className="font-bold">
                  Report Category
                </Label>
                <Select
                  value={reportCategory}
                  onValueChange={setReportCategory}
                >
                  <SelectTrigger
                    id="category"
                    className="border-3 border-foreground shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]"
                  >
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent className="border-3 border-foreground">
                    <SelectItem value="fraud">Fraudulent Listing</SelectItem>
                    <SelectItem value="incorrect">
                      Incorrect Information
                    </SelectItem>
                    <SelectItem value="unavailable">
                      Property Not Available
                    </SelectItem>
                    <SelectItem value="duplicate">
                      Duplicate Listing
                    </SelectItem>
                    <SelectItem value="inappropriate">
                      Inappropriate Content
                    </SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="details" className="font-bold">
                  Additional Details
                </Label>
                <Textarea
                  id="details"
                  placeholder="Please provide more information about the issue..."
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  className="min-h-[120px] border-3 border-foreground shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-3 border-foreground bg-transparent shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleReportSubmit}
                disabled={!reportCategory || !reportDetails.trim() || isSubmittingReport}
                className="border-3 border-foreground bg-primary shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] disabled:opacity-50"
              >
                {isSubmittingReport ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Report"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
