'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = pathname.startsWith('/letters')

  if (isPublic) {
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
