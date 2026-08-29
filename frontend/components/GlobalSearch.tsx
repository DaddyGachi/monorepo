"use client"

import * as React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SearchIcon, Loader2, CommandIcon, AlertCircle } from "lucide-react"
import { Command as CommandPrimitive } from "cmdk"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import useAuthStore from "@/store/useAuthStore"
import {
  globalSearch as runGlobalSearch,
  type GroupedResults,
  type SearchResult,
} from "@/lib/globalSearchApi"

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GroupedResults[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  const debouncedQuery = useDebounce(query, 300)

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setResults([])
        setError(null)
      }
      onOpenChange(newOpen)
    },
    [onOpenChange],
  )

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!debouncedQuery.trim()) return

    let cancelled = false

    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await runGlobalSearch(debouncedQuery, isAuthenticated)
        if (!cancelled) {
          setResults(data)
          setLoading(false)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "An unexpected error occurred",
          )
          setLoading(false)
        }
      }
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [debouncedQuery, isAuthenticated])

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onOpenChange(false)
      router.push(result.href)
    },
    [router, onOpenChange],
  )

  const totalResults = results.reduce(
    (acc, group) => acc + group.results.length,
    0,
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="top-[15%] translate-y-0 sm:max-w-[600px] p-0 gap-0 overflow-hidden"
        showCloseButton={false}
        aria-label="Global search"
      >
        <CommandPrimitive shouldFilter={false} loop={false}>
          <div
            className="flex items-center gap-2 border-b px-3"
            data-slot="command-input-wrapper"
          >
            <SearchIcon className="size-4 shrink-0 opacity-50" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="Search properties, deals, documents..."
              aria-label="Search"
            />
          </div>

          <CommandPrimitive.List
            id="global-search-list"
            className="max-h-[400px] overflow-y-auto"
            role="listbox"
          >
            {debouncedQuery.trim() && loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2
                  className="size-5 animate-spin text-muted-foreground"
                  role="status"
                  aria-label="Loading search results"
                />
                <span className="ml-2 text-sm text-muted-foreground">
                  Searching...
                </span>
              </div>
            )}

            {!loading && error && (
              <div
                className="flex flex-col items-center py-8 text-center px-4"
                role="alert"
              >
                <AlertCircle className="size-6 text-destructive mb-2" />
                <p className="text-sm font-medium text-destructive">
                  Search failed
                </p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            )}

            {!loading &&
              !error &&
              debouncedQuery.trim().length > 0 &&
              totalResults === 0 && (
                <div className="flex flex-col items-center py-8 text-center px-4">
                  <SearchIcon className="size-6 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">
                    No results found
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Try adjusting your search terms
                  </p>
                </div>
              )}

            {!loading &&
              !error &&
              results.map((group) => (
                <CommandPrimitive.Group
                  key={group.label}
                  heading={group.label}
                >
                  {group.results.map((result) => (
                    <CommandPrimitive.Item
                      key={`${result.type}-${result.id}`}
                      value={`${result.type}-${result.id}`}
                      onSelect={() => handleSelect(result)}
                      className="flex flex-col items-start px-4 py-3"
                      role="option"
                    >
                      <span className="text-sm font-medium">
                        {result.title}
                      </span>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {result.subtitle}
                      </span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}

            {!debouncedQuery.trim() && (
              <div className="flex flex-col items-center py-16 text-center px-4">
                <CommandIcon className="size-8 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  Type to search across everything
                </p>
                <p className="text-xs text-muted-foreground/60 mt-2">
                  Use{" "}
                  <kbd className="px-1 py-0.5 border rounded text-[11px] font-mono">
                    &uarr;&darr;
                  </kbd>{" "}
                  to navigate,{" "}
                  <kbd className="px-1 py-0.5 border rounded text-[11px] font-mono">
                    Enter
                  </kbd>{" "}
                  to select
                </p>
              </div>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  )
}
