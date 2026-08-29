import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import type { PropertyListing } from '@/lib/propertiesApi'
import { PropertyCard, propertyListingToCard } from '@/components/property-card'

interface VirtualizedPropertyListProps {
  properties: PropertyListing[]
  onSaveToggle?: (id: string) => Promise<void>
  savedListingIds?: string[]
  isLoading?: boolean
  showCompare?: boolean
  initialScrollTop?: number
  onScrollTopChange?: (scrollTop: number) => void
}

const ITEM_HEIGHT = 400
const OVERSCAN_COUNT = 3

export function VirtualizedPropertyList({
  properties,
  onSaveToggle,
  savedListingIds = [],
  isLoading = false,
  showCompare = false,
  initialScrollTop = 0,
  onScrollTopChange,
}: VirtualizedPropertyListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container || initialScrollTop <= 0) return

    container.scrollTop = initialScrollTop
    container.dispatchEvent(new Event('scroll'))
  }, [initialScrollTop])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      setScrollTop(container.scrollTop)
      onScrollTopChange?.(container.scrollTop)
    }

    const resizeObserver = new ResizeObserver(() => {
      setContainerHeight(container.clientHeight)
    })

    container.addEventListener('scroll', handleScroll)
    resizeObserver.observe(container)

    setContainerHeight(container.clientHeight)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [onScrollTopChange])

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN_COUNT)
    const endIndex = Math.min(
      properties.length,
      Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN_COUNT,
    )

    return { startIndex, endIndex }
  }, [scrollTop, containerHeight, properties.length])

  const virtualizedItems = useMemo(() => {
    return properties.slice(visibleRange.startIndex, visibleRange.endIndex)
  }, [properties, visibleRange])

  const offsetY = visibleRange.startIndex * ITEM_HEIGHT

  const handleSaveToggle = useCallback(
    async (id: string) => {
      if (onSaveToggle) {
        await onSaveToggle(id)
      }
    },
    [onSaveToggle],
  )

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto"
      role="list"
      aria-label="Property listings"
    >
      {isLoading && (
        <div className="flex items-center justify-center h-full">
          <p>Loading properties...</p>
        </div>
      )}

      {!isLoading && properties.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <p>No properties found</p>
        </div>
      )}

      {!isLoading && properties.length > 0 && (
        <div
          style={{
            height: properties.length * ITEM_HEIGHT,
            position: 'relative',
          }}
        >
          <div
            style={{
              transform: `translateY(${offsetY}px)`,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1rem',
              padding: '1rem',
            }}
          >
            {virtualizedItems.map((property) => (
              <div
                key={property.listingId}
                role="listitem"
                style={{ height: ITEM_HEIGHT }}
              >
                <PropertyCard
                  property={propertyListingToCard(property)}
                  isFavorited={savedListingIds.includes(property.listingId)}
                  onFavoriteChange={() => handleSaveToggle(property.listingId)}
                  showCompare={showCompare}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default VirtualizedPropertyList
