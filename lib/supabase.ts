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
        process.env.SUPABASE_SERVICE_KEY!
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
