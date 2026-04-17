'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'

// Paths that render without the app shell (no Sidebar, no chrome).
// Used for auth/letter pages — only the page content is visible.
const BARE_PATHS = ['/login', '/forgot-password', '/reset-password']

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = pathname.startsWith('/letters')
  const isBare = BARE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (isPublic || isBare) {
    return (
      <body className="antialiased">
        {children}
      </body>
    )
  }

  return (
    <body className="antialiased flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </body>
  )
}
