import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg text-cream font-sans flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-semibold mb-2">ContentOS</h1>
        <p className="text-muted text-sm mb-8">Управление YouTube-контентом</p>
        <Link
          href="/youtube"
          className="inline-flex items-center gap-2 bg-surface border border-border rounded-lg px-6 py-3 text-sm hover:bg-[#1e1e21] transition-colors"
        >
          <span className="text-accent">&#9654;</span>
          YouTube
        </Link>
      </div>
    </div>
  )
}
