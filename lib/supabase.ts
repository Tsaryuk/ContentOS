// lib/supabase.ts
// Единый клиент Supabase для всего ContentOS
// Используй supabaseAdmin на сервере (API routes)
// Используй supabaseClient на клиенте (браузер)

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | null = null
let _client: SupabaseClient | null = null

// Серверный клиент — полный доступ, только в API routes / server components
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_admin) {
      _admin = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        {
          // Next 14 держит Data Cache для fetch НА ДИСКЕ (.next/cache), а
          // supabase-js ходит через fetch. Кэш переживает и pm2 restart, и
          // деплой: `git reset --hard` его не трогает, он в gitignore.
          //
          // 19.08 из-за этого RSS-фид подкаста полчаса отдавал байт в байт
          // прежний XML с пустыми description/itunes:email/itunes:category
          // после того, как поля заполнили в БД. Фид другого шоу, чей URL
          // запрашивался впервые, отдавал всё свежее — так и нашлось.
          // Для фида это тихий отказ: площадки просто не увидят выпуск.
          //
          // На сервере данные всегда берём из БД; кэширование для клиентов
          // задаём заголовком cache-control там, где оно нужно.
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              fetch(input, { ...init, cache: 'no-store' }),
          },
        }
      )
    }
    return (_admin as any)[prop]
  },
})

// Клиентский клиент — ограниченный доступ через anon key
export const supabaseClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_client) {
      _client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    }
    return (_client as any)[prop]
  },
})
