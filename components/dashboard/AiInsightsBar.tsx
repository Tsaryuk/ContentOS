'use client'

export function AiInsightsBar() {
  return (
    <div className="bg-surface/50 border border-border rounded-xl px-4 py-3 flex items-center gap-4 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">&#9889;</span>
        <span className="text-muted">AI Инсайты</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-1.5 cursor-pointer hover:text-cream text-muted transition-colors">
        <span className="bg-accent/15 text-accent text-[10px] font-medium px-1.5 py-0.5 rounded">3</span>
        <span>идеи для контента</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-1.5 cursor-pointer hover:text-cream text-muted transition-colors">
        <span className="bg-purple/15 text-purple text-[10px] font-medium px-1.5 py-0.5 rounded">2</span>
        <span>упоминания</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-1.5 cursor-pointer hover:text-cream text-muted transition-colors">
        <span className="bg-warn/15 text-warn text-[10px] font-medium px-1.5 py-0.5 rounded">1</span>
        <span>задача требует внимания</span>
      </div>
      <div className="ml-auto">
        <span className="text-[10px] text-dim cursor-pointer hover:text-muted transition-colors">
          Открыть &rarr;
        </span>
      </div>
    </div>
  )
}
