'use client'

// Next.js App Router root-level error boundary — captures React rendering
// errors that escape per-route error boundaries. Required for Sentry to
// report client-side errors that break the whole app shell.

import * as Sentry from '@sentry/nextjs'
import Error from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="ru">
      <body>
        <Error statusCode={500} />
      </body>
    </html>
  )
}
