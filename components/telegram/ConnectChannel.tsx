'use client'

import { useState } from 'react'
import { Phone, Key, Shield, Loader2, CheckCircle } from 'lucide-react'

interface ConnectChannelProps {
  onConnected: () => void
  onClose: () => void
}

type Step = 'phone' | 'code' | '2fa' | 'done'

export function ConnectChannel({ onConnected, onClose }: ConnectChannelProps) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [phoneCodeHash, setPhoneCodeHash] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ channelsCount: number } | null>(null)

  async function handleSendCode() {
    if (!phone.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/telegram/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPhoneCodeHash(data.phoneCodeHash)
      setStep('code')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(withPassword?: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/telegram/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          code: code.trim(),
          phoneCodeHash,
          password: withPassword || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.needs2FA) {
        setStep('2fa')
        return
      }
      setResult({ channelsCount: data.channelsCount })
      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-cream mb-4">
          Подключить Telegram
        </h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {step === 'phone' && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Введите номер телефона вашего Telegram-аккаунта.
              Мы отправим код подтверждения.
            </p>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
              <input
                type="tel"
                placeholder="+7 900 123 45 67"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendCode()}
                className="w-full pl-10 pr-4 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-muted hover:text-cream transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSendCode}
                disabled={loading || !phone.trim()}
                className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Отправить код
              </button>
            </div>
          </div>
        )}

        {step === 'code' && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Код отправлен на <span className="text-cream">{phone}</span>.
              Проверьте Telegram.
            </p>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
              <input
                type="text"
                placeholder="12345"
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                className="w-full pl-10 pr-4 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setStep('phone')}
                className="px-4 py-2 text-sm text-muted hover:text-cream transition-colors"
              >
                Назад
              </button>
              <button
                onClick={() => handleVerify()}
                disabled={loading || !code.trim()}
                className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Подтвердить
              </button>
            </div>
          </div>
        )}

        {step === '2fa' && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              <Shield className="inline w-4 h-4 mr-1" />
              Требуется пароль двухфакторной аутентификации.
            </p>
            <input
              type="password"
              placeholder="Пароль 2FA"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerify(password)}
              className="w-full px-4 py-2.5 bg-bg-input border border-border rounded-lg text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => handleVerify(password)}
                disabled={loading || !password}
                className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Войти
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
            <p className="text-cream font-medium">Telegram подключён!</p>
            <p className="text-sm text-muted">
              Найдено каналов: {result?.channelsCount ?? 0}
            </p>
            <button
              onClick={() => { onConnected(); onClose() }}
              className="px-6 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90"
            >
              Готово
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
