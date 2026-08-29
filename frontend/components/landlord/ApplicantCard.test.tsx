import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApplicantCard } from './ApplicantCard'

const applicant = {
  id: 'app-1',
  listingId: 'listing-1',
  tenantId: 'tenant-12345678',
  landlordId: 'landlord-1',
  status: 'approved' as const,
  preferredStartDate: '2025-01-01',
  paymentPlan: 'monthly',
  appliedAt: '2025-01-03T08:00:00.000Z',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+2348000000000',
  employmentStatus: 'Full-time',
  incomeBand: '$5k-$10k',
  ratingCardScore: 87,
}

describe('ApplicantCard', () => {
  it('renders applicant details and calls the view handler', async () => {
    const user = userEvent.setup()
    const onViewDetails = vi.fn()

    render(<ApplicantCard applicant={applicant} onViewDetails={onViewDetails} />)

    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText(/Rating Card Score/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /view details/i }))

    expect(onViewDetails).toHaveBeenCalledWith(applicant)
  })
})
