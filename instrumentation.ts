/**
 * Next.js instrumentation hook.
 * Loads the correct Sentry config based on the runtime that Next.js is
 * initializing — server (Node), edge (middleware), or unused for client
 * (client hot-path is loaded via sentry.client.config.ts automatically).
 *
 * Only runs when SENTRY_DSN is present so local/dev doesn't pay the cost.
 */
export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
