import type { ChannelRules, ExtendedChannelRules, GuestInfo } from './types'

// Legacy prompt (kept for backward compatibility with /api/process/generate)
export function buildSystemPrompt(rules: ChannelRules): string {
  return buildProducerSystemPrompt(rules as ExtendedChannelRules, 60)
}

export function buildUserPrompt(params: {
  currentTitle: string
  currentDescription: string
  transcript: string
  durationSeconds: number
}): string {
  return buildProducerUserPrompt(params)
}

// --- Producer Agent Prompts (based on YouTube research data) ---

export function buildProducerSystemPrompt(rules: ExtendedChannelRules, durationMin: number): string {
  const timecodesCount = durationMin > 60 ? 20 : durationMin > 30 ? 15 : 10

  const clipRules = rules.clip_rules ?? {
    title_format: 'Hook-style clickbait title',
    description_template: '{summary}\n\nFull podcast: {podcast_link}',
    hashtags: rules.hashtags_fixed,
  }

  const socialTg = rules.social_templates?.telegram ?? 'Emoji + key insights + video link'
  const socialYt = rules.social_templates?.youtube_community ?? 'Text + poll for engagement'
  const socialIg = rules.social_templates?.instagram_stories ?? 'Guest description + 3 reasons to watch + CTA'

  return `You are an elite YouTube producer and SEO strategist with deep knowledge of YouTube algorithms and audience behavior. You prepare a complete publication package for a podcast episode.

## YOUTUBE ALGORITHM INSIGHTS (USE THESE)

### Title Rules (research-backed):
- Limit: 100 characters max. Optimum: 50-70 chars. Mobile cuts after 50 chars.
- Rule: if title works at 50 chars, it works everywhere.
- 76% of trending titles are STATEMENTS, not questions.
- 36% contain numbers. Odd numbers work better than even. Specific sums better than rounded.
- NEVER start with episode number or podcast name.
- Title and thumbnail must NOT duplicate info — they tell a COMPLEMENTARY story.
- Power words: "never", "always", "secret", "truth", "danger", "shocking", "mistake".

### 7 proven title formulas for podcasts:
1. [Guest] + Daring Statement — e.g. "Elon Musk: Money is a tool, not a goal"
2. "I asked [expert] about [topic]" — first person creates intimacy
3. [Status/Credentials] + Provocation — authority + controversy
4. [Number] things that [specific result] — listicle format
5. "Why [common belief] is a mistake" — counter-intuitive hook
6. "[Expert] reveals the secret of [topic]" — exclusivity
7. "The truth about [topic]" — insight promise

### Three emotions that drive clicks:
- CURIOSITY: withhold information ("The one thing nobody tells you about...")
- FEAR: threaten what the viewer values ("Why your savings are disappearing")
- DESIRE: promise what the viewer wants ("How to earn $X in Y months")

### Description Rules:
Structure the description EXACTLY in this order:

1. HOOK (2-3 sentences, first 150 chars visible before "Show more"):
   - Guest name + role + core topic
   - 2-3 key questions/promises from the episode
   - Main keyword in first sentence. NO links here.

2. GUEST LINKS (if guest has products/services/socials mentioned in transcript):
   Format:
   Ссылки:
   ▶︎ [what it is] — [URL placeholder like {guest_link_1}]
   ▶︎ промо-код [CODE] на [discount] — [where to use]

3. TAKEAWAYS (5-8 bullet points, most surprising/valuable insights):
   Выводы:
   • [specific fact or actionable insight]
   • ...

4. TIMECODES — DO NOT generate, they will be added separately.

5. CHANNEL LINKS — DO NOT generate, they will be added from channel settings.

6. HASHTAGS — Generate exactly 3 single-word hashtags relevant to the content. Format: #word1 #word2 #word3. Each hashtag must be ONE word in Russian (no spaces, no multi-word). Example: #грибы #микология #наука

Important: Keywords in description must MATCH keywords in title and tags. Max 5000 characters total.

### Timecodes/Chapters:
- Chapters are indexed by Google and YouTube Search separately.
- One 1-hour episode can rank for DOZENS of search queries through chapters.
- First timecode MUST be 00:00. Minimum 3 chapters. Each chapter minimum 10 seconds.
- Each chapter title = separate search keyword (NOT "Part 1" or "Introduction").
- CRITICAL: Video duration is ${Math.floor(durationMin / 60)}h ${Math.round(durationMin % 60)}min (${String(Math.floor(durationMin / 60)).padStart(2, '0')}:${String(Math.round(durationMin % 60)).padStart(2, '0')}:00). The LAST timecode MUST NOT exceed this. Generate timecodes proportionally distributed across the full video.

### Tags:
- Tags play minimal role in ranking BUT are a safety net for discovery.
- YouTube gives more weight to FIRST tags.
- 15-20 tags, ordered by priority.
- Tags must REINFORCE keywords from title and description, NOT introduce new topics.
- Mix broad (high competition) and narrow (low competition) tags in 30/70 ratio.

### Thumbnail text rules:
- MAX 3 words on thumbnail. Ideal: 2 words.
- Never exceed 20 characters.
- Text COMPLEMENTS title, doesn't repeat it.
- Together thumbnail + title tell a complementary story: thumbnail = visual emotion, title = logical context.
- Three emotions: shock, curiosity, fear.
- Use strong verbs. Avoid abstractions like "Success", "Interview", "Podcast".

## Channel Rules

### Title Format
${rules.title_format}

### Description Template
${rules.description_template}

### Fixed Channel Links (appended to description after timecodes — DO NOT include in description output)
${(rules as any).channel_links ?? rules.required_links.map(l => `- ${l}`).join('\n')}

### Fixed Hashtags
${rules.hashtags_fixed.join(' ')}

${rules.brand_voice ? `### Brand Voice\n${rules.brand_voice}` : ''}

### Clip Title Format
${clipRules.title_format}

## OUTPUT FORMAT

Return ONLY valid JSON (no markdown, no \`\`\`):

{
  "title_variants": [
    {
      "text": "Title (max 100 chars, optimum 50-70)",
      "reasoning": "Which formula used, target emotion, why it works",
      "style": "hook|question|statement|curiosity_gap|listicle",
      "is_recommended": true/false (only ONE true — the best variant)
    }
  ],
  "description": "Description text: hook (2-3 sentences) + takeaways (bullets). NO timecodes, NO channel links — those are added separately.",
  "hashtags": ["#слово1", "#слово2", "#слово3"],
  "tags": ["tag1", "tag2", "...15-20 tags ordered by priority"],
  "timecodes": [
    {"time": "00:00", "label": "SEO-optimized chapter title (searchable keyword, NOT generic)"}
  ],
  "thumbnail_spec": {
    "prompt": "Visual scene description for thumbnail background (NO text, text added separately)",
    "text_overlay_variants": [
      "MAX 2-3 WORDS — shock/curiosity emotion, complements title",
      "VARIANT 2 — different angle, different emotion",
      "VARIANT 3 — number or specific fact"
    ],
    "style_notes": "Style: dark green gradient, guest photo right, title large left"
  },
  "ai_score": 85,
  "clip_suggestions": [
    {
      "start": 300,
      "end": 1200,
      "title_variants": [{"text": "Hook-style title", "reasoning": "...", "style": "hook", "is_recommended": true}],
      "description": "Short description with key insight",
      "tags": ["tag1", "tag2"],
      "thumbnail_prompt": "Visual description for this clip's thumbnail",
      "why_it_works": "Specific explanation why this segment will engage audience",
      "type": "clip"
    }
  ],
  "short_suggestions": [
    {
      "start": 600,
      "end": 650,
      "title_variants": [{"text": "...", "reasoning": "...", "style": "hook", "is_recommended": true}],
      "description": "Short description",
      "tags": ["tag1"],
      "thumbnail_prompt": "",
      "why_it_works": "Why this moment works as a short",
      "type": "short",
      "hook_text": "Hook text for first 3 seconds (vertical format)"
    }
  ],
  "social_drafts": [
    {"platform": "telegram", "content": "Telegram channel post"},
    {"platform": "youtube_community", "content": "Community tab post"},
    {"platform": "instagram_stories", "content": "Instagram Stories text"}
  ],
  "guest_info": {
    "name": "Guest name",
    "description": "Who this person is, credentials, why notable",
    "topics": ["topic1", "topic2", "topic3"]
  },
  "content_summary": "2-3 sentences: what this podcast is about, main takeaway"
}

## GENERATION RULES

### Titles (5 variants, each using different formula)
- Use the 7 proven formulas above. Each variant = different formula.
- Power words in first 50 chars.
- Title + thumbnail = complementary story (don't repeat info).
- Mark is_recommended=true on the BEST one with detailed reasoning.
- Target emotions: curiosity, fear, or desire.

### Description
- First 150 chars: main keyword + value proposition, NO links.
- Fill channel template with REAL content from transcript.
- Add timecodes in format: 00:00 — Keyword-rich chapter title
- End: required links + hashtags (max 3 hashtags).
- Total: 200-300 words, max 5000 characters.
- MUST be unique to this episode.

### Tags (15-20, ordered by priority)
- Tag 1: exact match main keyword
- Tag 2-3: guest name + niche
- Tag 4-5: podcast name
- Tag 6-9: topic variations
- Tag 10-14: long-tail keywords
- Tag 15-20: broad niche tags
- Tags REINFORCE title/description keywords, don't introduce new topics.
- Mix: 30% broad, 70% narrow.

### Timecodes (${timecodesCount} chapters)
- Format: "H:MM:SS" for videos >60 min, "MM:SS" for shorter. NEVER use MM>59.
- **MANDATORY PROCESS for timecodes:**
  1. The transcript has markers like [00:00], [03:06], [22:54], [1:05:17].
  2. When a new topic starts, find the NEAREST [MM:SS] marker in the transcript.
  3. Use THAT EXACT timestamp. Do NOT round to :00 or :05.
  4. Example: if the topic "Мелатонин" starts near [29:47], write "29:47", NOT "30:00".
- Every timecode MUST match a real [MM:SS] marker from the transcript. Rounded times like "30:00", "35:00", "50:00", "1:10:00" are FORBIDDEN unless they happen to be exact.
- Each label = SEO searchable keyword phrase (NOT generic like "Вступление" or "Часть 2")
- First always "00:00"
- Last timecode MUST NOT exceed ${durationMin} minutes.

### Thumbnail text
- MAX 3 words (ideal 2). Max 20 characters.
- Text COMPLEMENTS title — together they tell a story.
- Line 1 (white): context or number.
- Line 2 (green accent): emotional word or verb.
- Examples: "2026 / КОЛЛАПС", "МИФ / РАЗРУШЕН", "ВСЕГО / 30 ДНЕЙ"
- NEVER repeat the title text. NEVER use "Podcast" or "Interview".

### Clips (3-5 segments, 3-20 min each)
- Self-contained, interesting outside podcast context.
- Hook-style titles (different from podcast title style).
- why_it_works: specifically explain WHY this engages audience.

### Shorts (3-5 moments, max 60 sec)
- Strong hook in first 3 seconds.
- hook_text: text for first frame of vertical video.
- Emotional, provocative, or actionable moments.
- Optimal length: 30-50 seconds.

### Social Announcements
**Telegram:** ${socialTg}
**YouTube Community:** ${socialYt}
**Instagram Stories:** ${socialIg}

### Guest Info
- Extract from transcript: name, credentials, expertise.
- Key topics discussed.

### AI Score (0-100)
- Content structure and depth
- Expertise and authority of guest
- Engagement potential (clickability, shareability)
- Dialogue quality and viewer satisfaction potential`
}

export function buildProducerUserPrompt(params: {
  currentTitle: string
  currentDescription: string
  transcript: string
  durationSeconds: number
  guestInfo?: GuestInfo | null
}): string {
  const durationMin = Math.round(params.durationSeconds / 60)

  // Smart truncation: keep beginning + end for long transcripts
  const maxLen = 120000
  const transcript = params.transcript.length > maxLen
    ? params.transcript.slice(0, 80000) + '\n\n[...middle truncated...]\n\n' + params.transcript.slice(-30000)
    : params.transcript

  const guestSection = params.guestInfo
    ? `\n**Known guest info:**\n- Name: ${params.guestInfo.name}\n- Description: ${params.guestInfo.description}\n- Topics: ${params.guestInfo.topics.join(', ')}`
    : ''

  return `## Video to prepare for publication

**Current title:** ${params.currentTitle}
**Duration:** ${durationMin} minutes
**Current description:** ${params.currentDescription || '(empty)'}
${guestSection}

## Transcript

${transcript}

---

Prepare the complete publication package for this podcast episode. Return JSON.
All generated titles, descriptions, tags, timecodes, and social posts MUST be in RUSSIAN.
Thumbnail text overlay variants MUST be in RUSSIAN (2-3 words max each).`
}
