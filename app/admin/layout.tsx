import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

/**
 * Gate every /admin/* page on admin role.
 * Middleware already checks authenticated; this layer checks role and
 * redirects non-admins to /. Keeps rendering of admin UI off the bundle
 * for regular users.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session.userId) redirect('/login?from=/admin')
  if (session.userRole !== 'admin') redirect('/')
  return <>{children}</>
}
