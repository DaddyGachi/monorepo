import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './badge'
import { Button } from './button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card'

describe('shared UI primitives', () => {
  it('renders a button with the requested variant and size classes', () => {
    render(
      <Button variant="destructive" size="sm" data-testid="action-button">
        Delete
      </Button>,
    )

    const button = screen.getByTestId('action-button')

    expect(button).toHaveTextContent('Delete')
    expect(button).toHaveClass('bg-destructive')
    expect(button).toHaveClass('h-8')
  })

  it('renders a badge with the outline variant styling', () => {
    render(<Badge variant="outline">New</Badge>)

    const badge = screen.getByText('New')

    expect(badge).toHaveClass('border')
    expect(badge).toHaveClass('text-foreground')
  })

  it('renders card subcomponents with the expected data slots', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card title</CardTitle>
          <CardDescription>Helpful summary</CardDescription>
        </CardHeader>
        <CardContent>Body copy</CardContent>
        <CardFooter>Footer action</CardFooter>
      </Card>,
    )

    expect(screen.getByText('Card title')).toBeInTheDocument()
    expect(screen.getByText('Helpful summary')).toBeInTheDocument()
    expect(screen.getByText('Body copy')).toBeInTheDocument()
    expect(screen.getByText('Footer action')).toBeInTheDocument()
  })
})
