'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Ссылка недействительна')
      return
    }
    if (password.length < 10) {
      setError('Пароль должен быть не менее 10 символов')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })

    if (res.ok) {
      setDone(true)
      setTimeout(() => router.push('/login'), 2000)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Ошибка')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-purple flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
            C
          </div>
          <h1 className="text-cream text-lg font-semibold">Новый пароль</h1>
          <p className="text-muted text-sm mt-1">
            {done ? 'Пароль изменён' : 'Придумайте новый пароль'}
          </p>
        </div>

        {done ? (
          <p className="text-cream text-sm text-center">
            Пароль успешно изменён. Перенаправляем на страницу входа…
          </p>
        ) : !token ? (
          <div className="space-y-3">
            <p className="text-red-400 text-sm text-center">Ссылка недействительна</p>
            <Link
              href="/forgot-password"
              className="block w-full py-3 rounded-xl bg-surface hover:bg-surface/70 text-cream text-sm font-medium text-center transition-colors"
            >
              Запросить новую ссылку
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Новый пароль (минимум 10 символов)"
              autoFocus
              required
              minLength={10}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-cream placeholder:text-dim focus:outline-none focus:border-accent/50 text-sm"
            />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Повторите пароль"
              required
              minLength={10}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-cream placeholder:text-dim focus:outline-none focus:border-accent/50 text-sm"
            />

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="w-full py-3 rounded-xl bg-accent hover:opacity-90 disabled:opacity-30 text-white text-sm font-medium transition-opacity flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Сохранить пароль
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
