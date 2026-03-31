'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import {
  GitFork,
  LogOut,
  Plus,
  Settings,
  User as UserIcon,
  Menu,
  X,
  Zap,
} from 'lucide-react';

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setDropdownOpen(false);
    router.push('/');
    router.refresh();
  };

  return (
    <nav className="glass-bright sticky top-0 z-50 border-b border-border">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href={user ? '/dashboard' : '/'}
          className="flex items-center gap-2.5 group"
          id="nav-logo"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            Dev<span className="gradient-text">Forge</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {!loading && user ? (
            <>
              <Link
                href="/dashboard"
                className="px-3 py-2 text-sm text-muted hover:text-foreground transition-colors rounded-md hover:bg-surface-hover"
                id="nav-dashboard"
              >
                Dashboard
              </Link>
              <Link
                href="/explore"
                className="px-3 py-2 text-sm text-muted hover:text-foreground transition-colors rounded-md hover:bg-surface-hover"
                id="nav-explore"
              >
                Explore
              </Link>
              <div className="mx-2 h-5 w-px bg-border" />
              <Link
                href="/new"
                className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                id="nav-new-repo"
              >
                <Plus className="h-4 w-4" />
                New
              </Link>

              {/* User Dropdown */}
              <div className="relative ml-2">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-border hover:border-border-bright transition-colors overflow-hidden"
                  id="nav-user-menu"
                  aria-label="User menu"
                >
                  {user.user_metadata?.avatar_url ? (
                    <Image
                      src={user.user_metadata.avatar_url}
                      alt="User Avatar"
                      width={32}
                      height={32}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <UserIcon className="h-4 w-4 text-muted" />
                  )}
                </button>

                {dropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl glass-bright border border-border shadow-xl shadow-black/20 animate-slide-down overflow-hidden">
                      <div className="border-b border-border px-4 py-3">
                        <p className="text-sm font-medium text-foreground truncate">
                          {user.user_metadata?.full_name || user.email}
                        </p>
                        <p className="text-xs text-muted truncate">
                          {user.email}
                        </p>
                      </div>
                      <div className="py-1.5">
                        <Link
                          href="/dashboard"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                        >
                          <GitFork className="h-4 w-4" />
                          Your repositories
                        </Link>
                        <Link
                          href="/settings"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                        >
                          <Settings className="h-4 w-4" />
                          Settings
                        </Link>
                      </div>
                      <div className="border-t border-border py-1.5">
                        <button
                          onClick={handleSignOut}
                          className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
                          id="nav-sign-out"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : !loading ? (
            <>
              <Link
                href="/login"
                className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
                id="nav-login"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="ml-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors shadow-lg shadow-primary/20"
                id="nav-register"
              >
                Get Started
              </Link>
            </>
          ) : null}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-border hover:bg-surface-hover transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          id="nav-mobile-toggle"
        >
          {menuOpen ? (
            <X className="h-5 w-5 text-muted" />
          ) : (
            <Menu className="h-5 w-5 text-muted" />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden glass-bright border-t border-border animate-slide-down">
          <div className="px-4 py-4 space-y-2">
            {!loading && user ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/new"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-primary hover:bg-primary/10 transition-colors"
                >
                  + New Repository
                </Link>
                <div className="h-px bg-border my-2" />
                <button
                  onClick={() => {
                    handleSignOut();
                    setMenuOpen(false);
                  }}
                  className="block w-full text-left rounded-lg px-3 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : !loading ? (
              <>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-primary-hover transition-colors"
                >
                  Get Started
                </Link>
              </>
            ) : null}
          </div>
        </div>
      )}
    </nav>
  );
}
