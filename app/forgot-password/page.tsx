'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    if (res.ok) {
      setDone(true)
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
          <h1 className="text-cream text-lg font-semibold">Сброс пароля</h1>
          <p className="text-muted text-sm mt-1">
            {done ? 'Письмо отправлено' : 'Укажите email от аккаунта'}
          </p>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="text-cream text-sm text-center">
              Если этот email зарегистрирован, мы отправили ссылку для сброса пароля. Срок действия — 1 час.
            </p>
            <Link
              href="/login"
              className="block w-full py-3 rounded-xl bg-surface hover:bg-surface/70 text-cream text-sm font-medium text-center transition-colors"
            >
              Назад ко входу
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              autoFocus
              required
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-cream placeholder:text-dim focus:outline-none focus:border-accent/50 text-sm"
            />

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3 rounded-xl bg-accent hover:opacity-90 disabled:opacity-30 text-white text-sm font-medium transition-opacity flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Отправить ссылку
            </button>

            <Link
              href="/login"
              className="block text-center text-muted text-xs hover:text-cream transition-colors mt-4"
            >
              Назад ко входу
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
