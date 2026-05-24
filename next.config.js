const { execSync } = require('child_process')
const { withSentryConfig } = require('@sentry/nextjs')

let gitSha = 'dev'
try { gitSha = execSync('git rev-parse --short HEAD').toString().trim() } catch {}

// Content Security Policy.
// Reasoning per directive:
//   script-src — 'unsafe-inline'+'unsafe-eval' are required by Next.js for
//     client-side hydration (it ships inline boot script). Tightening this
//     properly needs nonce-based CSP via middleware — leave for a follow-up.
//     Whitelisted hosts: Sentry (error tracking), tsaryuk.ru (external menu
//     bundle used by the public letters site), Yandex Metrika.
//   style-src — Tailwind ships some inline styles; same as script-src needs
//     nonce work to remove unsafe-inline.
//   img-src — wide-open https: because users upload covers from many CDNs
//     (Supabase storage, YouTube thumbnails, Telegram media).
//   connect-src — XHR to Anthropic and Supabase from server only; client
//     XHR is same-origin. Allow https: + wss: for safety on websockets.
//   frame-src — YouTube embeds in articles + Google login overlays.
//   object-src 'none' — eliminate Flash/PDF plugin XSS surface.
//   base-uri 'self' — block <base href> hijacks.
//   frame-ancestors 'self' — equivalent to X-Frame-Options: SAMEORIGIN
//     (browsers ignore the older header when CSP is present).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io https://tsaryuk.ru https://mc.yandex.ru https://*.youtube.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options',        value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(self), geolocation=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_SHA: gitSha },
  experimental: {
    serverComponentsExternalPackages: ['ssh2', 'ssh2-sftp-client'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

// Only wrap with Sentry when DSN is configured — avoids build-time auth-token
// requirement in environments without SENTRY_DSN set.
const sentryWebpackPluginOptions = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Don't upload source maps in dev / when credentials missing.
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
}

module.exports = process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig
