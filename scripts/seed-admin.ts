import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

async function seed() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME ?? 'Admin'
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars')
    process.exit(1)
  }
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const passwordHash = await bcrypt.hash(password, 12)

  const { data, error } = await supabase
    .from('users')
    .upsert(
      { email, password_hash: passwordHash, name, role: 'admin', is_active: true },
      { onConflict: 'email' }
    )
    .select()
    .single()

  if (error) {
    console.error('Failed to seed admin:', error.message)
    process.exit(1)
  }

  console.log(`Admin user created/updated: ${data.email} (${data.id})`)
}

seed()
