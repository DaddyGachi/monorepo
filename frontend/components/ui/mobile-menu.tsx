"use client"

import * as React from "react"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { X, Menu, LogOut, LayoutDashboard, User, Search } from "lucide-react"
import useAuthStore from "@/store/useAuthStore"

interface MobileMenuProps {
  navLinks: Array<{ href: string; label: string }>
  pathname: string
  isAuthenticated?: boolean
  user?: { name?: string; email?: string } | null
  hydrated?: boolean
  onSearchOpen?: () => void
}

export function MobileMenu({ navLinks, pathname, isAuthenticated: authProp, user: userProp, hydrated, onSearchOpen }: Readonly<MobileMenuProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const storeAuth = useAuthStore()
  const isAuthenticated = authProp ?? storeAuth.isAuthenticated
  const user = userProp ?? storeAuth.user
  const displayName = user?.name || user?.email || "Account"

  const handleLogout = () => {
    storeAuth.logout()
    setIsOpen(false)
    router.push("/")
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        type="button"
        className="md:hidden p-3 border-3 border-foreground shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] bg-background min-h-11 min-w-11"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu Panel */}
          <div
            className="absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-card border-l-3 border-foreground shadow-xl"
          >
            <div className="flex h-16 items-center justify-between border-b-3 border-foreground px-4">
              <span className="font-mono text-lg font-bold">Menu</span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 border-2 border-foreground min-h-11 min-w-11"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <nav className="h-full overflow-y-auto py-4">
              <div className="space-y-2 px-4">
                <button
                  onClick={() => {
                    setIsOpen(false)
                    onSearchOpen?.()
                  }}
                  className="w-full flex items-center gap-3 py-3 px-4 text-lg font-medium transition-colors hover:text-primary min-h-11 border-2 border-transparent hover:border-foreground/20 text-foreground"
                  aria-label="Open global search"
                >
                  <Search className="h-5 w-5 shrink-0" />
                  <span>Search</span>
                  <kbd className="ml-auto inline-flex items-center gap-0.5 rounded-sm border border-foreground/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                    <span className="text-[9px]">&#8984;</span>K
                  </kbd>
                </button>
                <div className="border-t-2 border-foreground/10 pt-2" />
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "py-3 px-4 text-lg font-medium transition-colors hover:text-primary min-h-11 flex items-center border-2 border-transparent",
                      pathname === link.href 
                        ? "text-primary border-primary bg-primary/10" 
                        : "text-foreground hover:border-foreground/20"
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              
              {/* Mobile Auth Actions */}
              <div className="mt-8 space-y-3 px-4 border-t-3 border-foreground pt-4">
                {!hydrated ? null : isAuthenticated ? (
                  <>
                    <div className="flex items-center gap-3 px-4 py-2 text-sm font-bold text-foreground/70">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{displayName}</span>
                    </div>
                    <Link href="/dashboard/user" onClick={() => setIsOpen(false)}>
                      <Button
                        variant="outline"
                        className="w-full justify-start border-2 border-foreground font-bold bg-background text-foreground min-h-12"
                      >
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Dashboard
                      </Button>
                    </Link>
                    <Link href="/dashboard/user" onClick={() => setIsOpen(false)}>
                      <Button
                        variant="outline"
                        className="w-full justify-start border-2 border-foreground font-bold bg-background text-foreground min-h-12"
                      >
                        <User className="mr-2 h-4 w-4" />
                        Profile & Settings
                      </Button>
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center justify-center gap-2 border-3 border-destructive/50 bg-destructive/10 font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-destructive min-h-12 rounded-lg"
                    >
                      <LogOut className="h-4 w-4" />
                      Log Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" onClick={() => setIsOpen(false)}>
                      <Button
                        variant="outline"
                        className="w-full border-3 border-foreground font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all bg-background text-foreground min-h-12"
                      >
                        Log In
                      </Button>
                    </Link>
                    <Link href="/signup" onClick={() => setIsOpen(false)}>
                      <Button className="w-full border-3 border-foreground bg-primary font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-foreground min-h-12">
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
