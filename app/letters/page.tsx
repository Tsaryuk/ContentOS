'use client'

import { useState, useEffect } from 'react'

interface Article {
  id: string
  subject: string
  blog_slug: string
  category: string | null
  sent_at: string
}

export default function LettersLandingPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [articles, setArticles] = useState<Article[]>([])
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/newsletter/issues?status=sent')
        const data = await res.json()
        if (data.issues) {
          setArticles(data.issues.filter((i: any) => i.blog_slug).slice(0, 10))
        }
      } catch { /* ignore */ }
    }
    load()
  }, [])

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.error) {
        setErrorMsg(data.error)
        setStatus('error')
      } else {
        setStatus('success')
      }
    } catch {
      setErrorMsg('Ошибка соединения')
      setStatus('error')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fff',
      color: '#111',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Hero */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '80px 24px 60px',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: '#999',
          marginBottom: 24,
        }}>
          Стратегия Жизни &middot; Денис Царюк
        </div>

        <h1 style={{
          fontFamily: "'Lora', Georgia, serif",
          fontSize: 36,
          fontWeight: 400,
          lineHeight: 1.3,
          margin: '0 0 16px',
        }}>
          Еженедельные письма о том, как строить жизнь осознанно
        </h1>

        <p style={{
          fontSize: 17,
          color: '#555',
          lineHeight: 1.6,
          margin: '0 0 32px',
        }}>
          Каждую неделю одно честное письмо. Про мышление, деньги, отношения и стратегию.
          Без достигаторства и пустых обещаний.
        </p>

        {status === 'success' ? (
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 12,
            padding: '24px 32px',
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#111' }}>
              Готово! Первое письмо уже в пути
            </p>
            <p style={{ fontSize: 14, color: '#555', marginBottom: 16 }}>
              Подпишись ещё на Telegram-канал
            </p>
            <a
              href="https://t.me/tsaryuk_ru"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '10px 24px',
                background: '#0088cc',
                color: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              @tsaryuk_ru
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubscribe} style={{
            display: 'flex',
            gap: 8,
            maxWidth: 420,
            margin: '0 auto 16px',
          }}>
            <input
              type="email"
              required
              placeholder="Ваш email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 15,
                outline: 'none',
                fontFamily: "'Inter', sans-serif",
              }}
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              style={{
                padding: '12px 24px',
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: status === 'loading' ? 0.6 : 1,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {status === 'loading' ? '...' : 'Подписаться'}
            </button>
          </form>
        )}
        {errorMsg && (
          <p style={{ color: '#dc2626', fontSize: 13 }}>{errorMsg}</p>
        )}
        {subscriberCount && (
          <p style={{ fontSize: 13, color: '#999' }}>
            {subscriberCount.toLocaleString()} подписчиков уже читают
          </p>
        )}
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #eee', maxWidth: 640, margin: '0 auto' }} />

      {/* About */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '48px 24px',
        textAlign: 'center',
      }}>
        <h2 style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: '#999',
          marginBottom: 16,
        }}>
          Автор
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: '#333' }}>
          Денис Царюк — стратег, подкастёр, исследователь. Ведёт подкаст «Личная Философия»
          и рассылку «Стратегия Жизни» для тех, кто думает о жизни как о проекте.
        </p>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #eee', maxWidth: 640, margin: '0 auto' }} />

      {/* What's inside */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '48px 24px',
      }}>
        <h2 style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: '#999',
          marginBottom: 24,
          textAlign: 'center',
        }}>
          Что внутри
        </h2>
        <div style={{ display: 'flex', gap: 32 }}>
          {[
            { title: 'Разговор о жизни', desc: 'Честный текст на одну тему: мышление, деньги, отношения, страхи. Без воды.' },
            { title: 'Подкаст', desc: 'Анонс свежего выпуска «Личной Философии» с гостем или соло.' },
            { title: 'Лайфхак недели', desc: 'Один совет, инструмент или наблюдение, проверенное на себе.' },
          ].map(item => (
            <div key={item.title} style={{ flex: 1 }}>
              <h3 style={{
                fontFamily: "'Lora', Georgia, serif",
                fontSize: 17,
                fontWeight: 600,
                marginBottom: 8,
              }}>
                {item.title}
              </h3>
              <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Archive */}
      {articles.length > 0 && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid #eee', maxWidth: 640, margin: '0 auto' }} />
          <section style={{
            maxWidth: 640,
            margin: '0 auto',
            padding: '48px 24px',
          }}>
            <h2 style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: '#999',
              marginBottom: 24,
              textAlign: 'center',
            }}>
              Архив выпусков
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {articles.map(a => (
                <a
                  key={a.id}
                  href={`/letters/${a.blog_slug}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid #f0f0f0',
                    textDecoration: 'none',
                    color: '#111',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{a.subject}</span>
                  <span style={{ fontSize: 12, color: '#999', whiteSpace: 'nowrap', marginLeft: 16 }}>
                    {a.category && <span style={{ marginRight: 12 }}>{a.category}</span>}
                    {new Date(a.sent_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </span>
                </a>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Bottom CTA */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '48px 24px 80px',
        textAlign: 'center',
      }}>
        {status !== 'success' && (
          <form onSubmit={handleSubscribe} style={{
            display: 'flex',
            gap: 8,
            maxWidth: 420,
            margin: '0 auto',
          }}>
            <input
              type="email"
              required
              placeholder="Ваш email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 15,
                outline: 'none',
                fontFamily: "'Inter', sans-serif",
              }}
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              style={{
                padding: '12px 24px',
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Подписаться
            </button>
          </form>
        )}
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #eee',
        padding: '24px',
        textAlign: 'center',
        fontSize: 12,
        color: '#999',
        fontFamily: "'Inter', sans-serif",
      }}>
        <a href="https://tsaryuk.ru" style={{ color: '#1a4fff', textDecoration: 'none' }}>tsaryuk.ru</a>
        &nbsp;&middot;&nbsp;
        <a href="https://t.me/tsaryuk_ru" style={{ color: '#1a4fff', textDecoration: 'none' }}>@tsaryuk_ru</a>
      </footer>
    </div>
  )
}
