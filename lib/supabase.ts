// lib/supabase.ts
// Единый клиент Supabase для всего ContentOS
// Используй supabaseAdmin на сервере (API routes)
// Используй supabaseClient на клиенте (браузер)

import { createClient } from '@supabase/supabase-js'

// Серверный клиент — полный доступ, только в API routes / server components
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Клиентский клиент — ограниченный доступ через anon key
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
