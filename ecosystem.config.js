const { readFileSync } = require('fs')
const { resolve } = require('path')

// Load .env.local if exists
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '.env.local')
    const content = readFileSync(envPath, 'utf-8')
    const env = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
    }
    return env
  } catch {
    return {}
  }
}

const dotenv = loadEnv()

module.exports = {
  apps: [
    {
      name: 'contentos',
      script: 'npm',
      args: 'start',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        ...dotenv,
      },
    },
    {
      name: 'worker',
      script: 'npx',
      args: 'tsx worker.ts',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        ...dotenv,
      },
    },
  ],
}
