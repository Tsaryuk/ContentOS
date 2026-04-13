import type { Metadata } from 'next'
import './globals.css'
import { LayoutShell } from '@/components/layout/LayoutShell'

export const metadata: Metadata = {
  title: 'ContentOS',
  description: 'Content management system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;600;700;900&family=Manrope:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700;900&family=Outfit:wght@400;500;600;700&family=Lora:wght@400;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme');
            if (t === 'light') document.documentElement.classList.remove('dark');
            else document.documentElement.classList.add('dark');
          } catch(e) {}
        ` }} />
      </head>
      <LayoutShell>{children}</LayoutShell>
    </html>
  )
}
