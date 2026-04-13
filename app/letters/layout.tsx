import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Стратегия Жизни — Денис Царюк',
  description: 'Еженедельные письма о том, как строить жизнь осознанно',
}

export default function LettersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
