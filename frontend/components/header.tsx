"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Home, ChevronDown, LogOut, LayoutDashboard, User, Search } from "lucide-react"
import { GlobalSearch } from "@/components/GlobalSearch"
import { MobileMenu } from "@/components/ui/mobile-menu"
import { ThemeToggle } from "@/components/theme-toggle"
import { CurrencyToggle } from "@/components/currency-toggle"
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton"
import { LanguageSwitcher } from "@/components/language-switcher"
import { NotificationBell } from "@/components/layout/NotificationBell"
import useAuthStore from "@/store/useAuthStore"

const navLinks = [
  { href: "/properties", label: "Find a Home" },
  { href: "/calculator", label: "Calculator" },
  { href: "/landlords", label: "For Landlords" },
  { href: "/about", label: "About" },
]

function getDashboardLink(user: { name?: string; email?: string } | null): string {
  return "/dashboard/user"
}

function AccountMenu() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const displayName = user?.name || user?.email || "Account"
  const dashboardLink = getDashboardLink(user)

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account menu for ${displayName}`}
        className="flex items-center gap-2 border-3 border-foreground px-3 py-1.5 font-bold shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all bg-background text-foreground min-h-[44px]"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-bold max-w-[100px] truncate hidden sm:block">
          {displayName}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 rounded-lg border-3 border-foreground bg-card shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] z-50 overflow-hidden"
        >
          <Link
            href={dashboardLink}
            role="menuitem"
            className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-primary/10 transition-colors border-b-2 border-foreground/10"
            onClick={() => setOpen(false)}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/dashboard/user"
            role="menuitem"
            className="flex items-center gap-3 px-4 py-3 text-sm font-bold hover:bg-primary/10 transition-colors border-b-2 border-foreground/10"
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4" />
            Profile & Settings
          </Link>
          <button
            role="menuitem"
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-bold text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => {
              logout()
              setOpen(false)
              router.push("/")
            }}
          >
            <LogOut className="h-4 w-4" />
            Log Out
          </button>
        </div>
      )}
    </div>
  )
}

export function Header() {
  const pathname = usePathname()
  const { isAuthenticated, user } = useAuthStore()
  const [hydrated, setHydrated] = useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setHydrated(true), 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setGlobalSearchOpen(true)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const isAuthPage = pathname === "/login" || pathname === "/signup"
  const isCompactHeader = pathname.startsWith("/dashboard")

  if (isAuthPage) return null

  if (isCompactHeader) {
    return (
      <header className="sticky top-0 z-50 bg-background border-b-4 border-foreground">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center border-3 border-foreground bg-primary shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
                <Home className="h-4 w-4 text-foreground" />
              </div>
              <span className="font-mono text-base font-black tracking-tight">
                SHELTER<span className="text-primary">FLEX</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <NotificationBell />
              {hydrated && isAuthenticated ? <AccountMenu /> : null}
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <>
    <header className="sticky top-0 z-50 bg-background border-b-4 border-foreground">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center border-3 border-foreground bg-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
              <Home className="h-5 w-5 sm:h-6 sm:w-6 text-foreground" />
            </div>
            <span className="font-mono text-lg sm:text-xl font-black tracking-tight">
              SHELTER<span className="text-primary">FLEX</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`font-medium transition-colors hover:text-primary text-sm sm:text-base ${
                  pathname === link.href ? "text-primary" : ""
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Search Trigger */}
          <div className="hidden lg:flex">
            <button
              onClick={() => setGlobalSearchOpen(true)}
              className="flex items-center gap-2 border-3 border-foreground px-3 py-1.5 font-bold shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all bg-background text-foreground min-h-[44px] text-sm"
              aria-label="Open global search"
            >
              <Search className="h-4 w-4" />
              <span className="hidden xl:inline">Search</span>
              <kbd className="ml-1 hidden xl:inline-flex items-center gap-0.5 rounded-sm border border-foreground/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                <span className="text-[9px]">&#8984;</span>K
              </kbd>
            </button>
          </div>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <LanguageSwitcher />
            <CurrencyToggle />
            <ThemeToggle />
            <NotificationBell />
            <ConnectWalletButton />
            {!hydrated ? (
              <div className="flex items-center gap-3 min-h-[44px]">
                <div className="w-20 h-[44px] bg-foreground/5 rounded animate-pulse" />
                <div className="w-28 h-[44px] bg-primary/20 rounded animate-pulse" />
              </div>
            ) : isAuthenticated ? (
              <AccountMenu />
            ) : (
              <>
                <Link href="/login">
                  <Button
                    variant="outline"
                    className="border-3 border-foreground font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 rtl:hover:-translate-x-0.5 hover:translate-y-0.5 transition-all bg-background text-foreground min-h-[44px] px-4 sm:px-6"
                  >
                    Log In
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button className="border-3 border-foreground bg-primary font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-0.5 rtl:hover:-translate-x-0.5 hover:translate-y-0.5 transition-all text-foreground min-h-[44px] px-4 sm:px-6">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu */}
          <MobileMenu navLinks={navLinks} pathname={pathname} isAuthenticated={isAuthenticated} user={user} hydrated={hydrated} onSearchOpen={() => setGlobalSearchOpen(true)} />
        </div>
      </div>
    </header>
      <GlobalSearch open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
    </>
  )
}
