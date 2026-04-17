'use client'

import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const params = useSearchParams()
  const from = params.get('from') || '/'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (res.ok) {
      router.push(from)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error || 'Ошибка')
      setPassword('')
      setLoading(false)
      emailRef.current?.focus()
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-purple flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
            C
          </div>
          <h1 className="text-cream text-lg font-semibold">ContentOS</h1>
          <p className="text-muted text-sm mt-1">Войдите в систему</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            ref={emailRef}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-cream placeholder:text-dim focus:outline-none focus:border-accent/50 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Пароль"
            className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-cream placeholder:text-dim focus:outline-none focus:border-accent/50 text-sm"
          />

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3 rounded-xl bg-accent hover:opacity-90 disabled:opacity-30 text-white text-sm font-medium transition-opacity flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Войти
          </button>

          <Link
            href="/forgot-password"
            className="block text-center text-muted text-xs hover:text-cream transition-colors mt-4"
          >
            Забыли пароль?
          </Link>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
