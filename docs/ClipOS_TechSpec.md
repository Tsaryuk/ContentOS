# ContentOS — Модуль создания клипов и вертикального контента
## Техническое задание для разработки

**Проект:** ContentOS  
**Стек:** Next.js / TypeScript / Supabase  
**Репозиторий:** github.com/Tsaryuk/ContentOS  
**Версия ТЗ:** 1.0  
**Дата:** Март 2026

---

## 1. КОНТЕКСТ И ЦЕЛЬ

ContentOS — система автоматизации управления метаданными YouTube-видео с обязательным человеческим апрувом перед любой записью. Текущий функционал: управление заголовками, описаниями, тегами, обложками.

**Новый модуль:** ClipOS — подсистема создания клипов и вертикального контента из длинных подкастов и видео.

**Бизнес-задача:** из одного эпизода подкаста (~90 мин) автоматически генерировать 5–10 готовых к публикации клипов (30–90 сек) и 1–3 мини-эпизода (5–20 мин), оптимизированных под YouTube Shorts, Instagram Reels, TikTok.

**Ключевой принцип (как в основном ContentOS):** никакая публикация или экспорт не происходит без явного апрува пользователя. Система предлагает, человек решает.

---

## 2. АРХИТЕКТУРА МОДУЛЯ

### 2.1 Высокоуровневая схема

```
ВХОДНЫЕ ДАННЫЕ
    ↓
[Загрузка видео/аудио + транскрипт]
    ↓
[Транскрибация — Whisper API / AssemblyAI]
    ↓
[Анализ транскрипта — Claude API]
    ↓  
[Идентификация клип-моментов + скоринг]
    ↓
[Очередь кандидатов на клипы — UI для ревью]
    ↓
[Апрув пользователя]
    ↓
[Экспорт + нарезка — FFmpeg / OpusClip API]
    ↓
[Субтитры — AssemblyAI / Captions API]
    ↓
[Финальный ревью + публикация]
```

### 2.2 Внешние API (не нагружают основной ContentOS)

| Сервис | Назначение | Приоритет |
|--------|-----------|-----------|
| **AssemblyAI** | Транскрипция + speaker diarization + временны́е метки на уровне слов | ОБЯЗАТЕЛЬНО |
| **Claude API (Anthropic)** | Анализ транскрипта, скоринг, генерация заголовков/описаний для клипов | ОБЯЗАТЕЛЬНО |
| **FFmpeg** (серверный) | Нарезка видео по таймстемпам, кроп 16:9 → 9:16, компрессия | ОБЯЗАТЕЛЬНО |
| **OpusClip API** | Опциональный второй проход для AI-рефрейминга лица в вертикальном видео | ОПЦИОНАЛЬНО |
| **Captions API** или **Submagic API** | Генерация анимированных субтитров (karaoke-style) | ОПЦИОНАЛЬНО |
| **YouTube Data API v3** | Публикация Shorts напрямую из интерфейса | ФАЗА 2 |

---

## 3. ФУНКЦИОНАЛЬНЫЕ ТРЕБОВАНИЯ

### 3.1 Загрузка и транскрибация

**F-01. Загрузка исходника**
- Поддерживаемые форматы: MP4, MOV, MKV (видео), MP3, M4A, WAV (аудио)
- Максимальный размер файла: 10 GB
- Загрузка через drag-and-drop или URL (YouTube, Google Drive)
- Прогресс-бар с процентами
- Сохранение исходника в Supabase Storage с CDN-ссылкой

**F-02. Транскрибация (AssemblyAI)**
- Автоматический запуск после загрузки
- Параметры запроса: `speech_model: "best"`, `speaker_labels: true`, `word_boost` (список терминов канала), `language_code: "ru"` 
- Результат: JSON с временны́ми метками на уровне каждого слова + разметка спикеров (SPEAKER_A, SPEAKER_B)
- Сохранение транскрипта в Supabase: таблица `transcripts`
- Отображение транскрипта в UI с возможностью ручной правки

**F-03. Идентификация спикеров**
- UI для назначения имён спикерам: SPEAKER_A → «Денис», SPEAKER_B → «Гость»
- Сохранение маппинга в таблице `speaker_profiles`
- Переиспользование профилей для последующих эпизодов

---

### 3.2 AI-анализ и скоринг моментов (Claude API)

**F-04. Идентификация клип-кандидатов**

Промт-система для Claude (claude-sonnet-4-20250514). Claude анализирует транскрипт и возвращает JSON-массив клип-кандидатов.

Каждый кандидат содержит:
```typescript
interface ClipCandidate {
  id: string;
  start_time: number;          // секунды
  end_time: number;            // секунды  
  duration: number;            // секунды
  clip_type: 'short' | 'mini_episode';
  scores: {
    hook: number;              // 0–100: есть ли хук в первые 3 сек
    emotional_peak: number;    // 0–100: эмоциональный пик
    information_density: number; // 0–100: факт+цифра+вывод
    standalone_value: number;  // 0–100: понятно без контекста
    virality_potential: number; // 0–100: итоговый скор
  };
  pattern_type: 
    | 'counter_intuitive'    // контринтуитивное заявление
    | 'emotional_peak'       // эмоциональный подъём/откровение
    | 'conflict_disagreement'// несогласие, спор
    | 'shock_statistic'      // шокирующая цифра/факт
    | 'practical_protocol'   // конкретный совет, протокол
    | 'humor_unexpected'     // юмор, неожиданный поворот
    | 'personal_revelation'; // личная история, откровение
  hook_phrase: string;       // первые слова/фраза хука
  one_sentence_value: string; // «суть за одно предложение»
  suggested_titles: string[]; // 3 варианта заголовка (45–60 симв.)
  suggested_thumbnail_text: string[]; // 3 варианта текста для обложки
  transcript_excerpt: string; // цитата из транскрипта
  context_notes: string;     // почему этот момент интересен
}
```

**F-05. Скоринг и ранжирование**
- Автоматическая сортировка по `virality_potential` (убывание)
- Цветовая кодировка: 80–100 (зелёный), 60–79 (жёлтый), <60 (серый)
- Фильтрация по типу (`short` / `mini_episode`), по паттерну, по минимальному скору
- Максимум 25 кандидатов на 90-минутный эпизод

**F-06. Промт-система для Claude**

Системный промт хранится в таблице `ai_prompts` (редактируемый из UI):

```
Ты — эксперт по созданию вирусного контента из подкастов.

Проанализируй транскрипт подкаста и найди 15–25 моментов,
подходящих для создания вирусных клипов.

ПРАВИЛА ОТБОРА:
1. Клип 30–90 сек: один момент с чётким хуком в первые 3 секунды
2. Мини-эпизод 5–20 мин: самодостаточная история с началом и концом
3. Первые слова должны цеплять без контекста
4. Информационная плотность: факт + цифра + вывод за 30 сек
5. Зритель должен мочь пересказать суть одним предложением

ПАТТЕРНЫ ВИРУСНОСТИ (приоритизируй в этом порядке):
- counter_intuitive: «все думают X, но на самом деле Y»
- shock_statistic: конкретная цифра, которая удивляет
- personal_revelation: личная история, уязвимость, откровение
- conflict_disagreement: несогласие между спикерами
- practical_protocol: конкретный совет с шагами
- emotional_peak: смех, слёзы, пауза перед важным словом
- humor_unexpected: неожиданный поворот, самоирония

ФОРМАТ: верни только валидный JSON без markdown
```

---

### 3.3 UI — Очередь клипов (Clip Queue)

**F-07. Главный экран модуля**

Двухпанельный layout:
- **Левая панель (40%):** список клип-кандидатов с скорами и метаданными
- **Правая панель (60%):** видеоплеер с предпросмотром выбранного клипа

Каждая карточка кандидата отображает:
- Таймстемп `[MM:SS – MM:SS]` и длительность
- Тип и паттерн (иконка + лейбл)
- Virality Score (цветной бейдж)
- hook_phrase (первая фраза)
- one_sentence_value
- Три кнопки: **✓ Апрув** / **✎ Редактировать** / **✗ Отклонить**

**F-08. Плеер с точными таймкодами**
- Видеоплеер автоматически перематывает к `start_time` клипа
- Визуальная разметка на тайм-линии: все кандидаты как цветные сегменты
- Кнопки: Play, +/-3 сек (для точной обрезки)
- Ручная корректировка `start_time` / `end_time` через инпуты
- Предпросмотр в 9:16 (вертикальный crop) и 16:9 (оригинал)

**F-09. Редактирование метаданных клипа (перед апрувом)**
- Выбор заголовка из 3 предложенных или ввод своего
- Выбор текста для обложки из 3 предложенных
- Поле для описания и хэштегов
- Выбор целевых платформ: YouTube Shorts / Instagram Reels / TikTok
- Выбор аспектного соотношения: 9:16 (вертикаль) / 16:9 (горизонталь) / 1:1 (квадрат)

---

### 3.4 Обработка видео (FFmpeg)

**F-10. Нарезка и экспорт**

После апрува запускается FFmpeg-задача (серверный процесс):

```bash
# Нарезка по таймкодам
ffmpeg -i input.mp4 -ss {start_time} -to {end_time} \
  -c:v libx264 -c:a aac -avoid_negative_ts 1 clip_raw.mp4

# Для 9:16 из 4K исходника (без потери качества)
ffmpeg -i clip_raw.mp4 \
  -vf "crop=ih*(9/16):ih,scale=1080:1920" \
  -c:v libx264 -crf 18 -c:a aac clip_vertical.mp4

# Для 9:16 из 1080p исходника (с blur-background)
ffmpeg -i clip_raw.mp4 \
  -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg];[0:v]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2" \
  clip_vertical_blur.mp4
```

Задачи FFmpeg выполняются в фоне (Supabase Edge Functions или отдельный Node.js worker). Статус обработки отображается в реальном времени через Supabase Realtime.

**F-11. Очередь обработки**
- Таблица `clip_jobs` со статусами: `pending` → `processing` → `done` / `failed`
- Приоритизация: апрувнутые клипы обрабатываются по очереди (не параллельно, чтобы не перегружать сервер)
- Уведомление пользователя по завершении (toast + email опционально)
- Хранение готовых клипов в Supabase Storage: `clips/{episode_id}/{clip_id}/`

---

### 3.5 Субтитры

**F-12. Генерация субтитров**

Используем временны́е метки уровня слов из AssemblyAI (уже в транскрипте). Генерируем `.srt` и `.vtt` файлы. Для анимированных субтитров — опциональная интеграция Submagic API.

Стандарт субтитров для вертикального контента:
- Шрифт: Montserrat Bold
- Размер: 48–56px при 1080×1920
- Цвет: белый (#FFFFFF) с чёрной обводкой 3px
- Позиция: центр, 20% от нижнего края
- Максимум 3 слова одновременно на экране (karaoke-style)
- Выделение текущего слова: жёлтый (#FFD400)

Стиль субтитров выбирается пользователем в настройках:
- `minimal` — белый текст, без анимации
- `karaoke` — word-by-word pop-up с жёлтым выделением  
- `bold_pop` — Bebas Neue, крупный, с drop-shadow

**F-13. Редактор субтитров**
- Inline-редактирование текста субтитров прямо в транскрипте
- Исправление ошибок распознавания одним кликом
- Добавление/удаление субтитровых фрагментов

---

### 3.6 Мини-эпизоды (5–20 минут)

**F-14. Логика создания мини-эпизода**

Мини-эпизод — это не один фрагмент, а **нарратив**, собранный из нескольких кусков разговора. Claude определяет набор фрагментов с временны́ми метками, объединённых одной темой.

Структура мини-эпизода от Claude:
```typescript
interface MiniEpisode {
  id: string;
  title: string;
  narrative_theme: string;      // «Осознанные сны: методика и практика»
  estimated_duration: number;   // минуты
  segments: Array<{
    start_time: number;
    end_time: number;
    role: 'hook' | 'setup' | 'development' | 'climax' | 'resolution';
    transition_note: string;    // что добавить между фрагментами
  }>;
  suggested_cuts: string[];     // что вырезать для динамики
  bridge_suggestions: string[]; // текст-мостики между фрагментами
  virality_score: number;
  suggested_titles: string[];
}
```

**F-15. Редактор мини-эпизода**
- Timeline-интерфейс: все сегменты на горизонтальной шкале
- Drag-and-drop для перестановки сегментов
- Добавление/удаление сегментов
- Поле для ввода текст-мостиков (накладываются как текстовый оверлей)
- Предпросмотр собранного мини-эпизода

---

### 3.7 Дашборд клипов

**F-16. Статус-дашборд**
- Канбан-доска со статусами: «Кандидаты» / «Апрувнуто» / «В обработке» / «Готово» / «Опубликовано»
- Фильтры: по эпизоду, по платформе, по дате, по паттерну
- Экспорт списка клипов с метаданными в CSV
- Статистика: сколько клипов создано, среднее время обработки, топ-паттерны

**F-17. История публикаций**
- Таблица всех опубликованных клипов
- Фаза 2: подтягивание реальных метрик через YouTube/Instagram API (просмотры, удержание)
- Сравнение предсказанного скора с реальными результатами (для улучшения модели)

---

## 4. СХЕМА БАЗЫ ДАННЫХ

### Новые таблицы Supabase

```sql
-- Транскрипты
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES episodes(id),
  raw_json JSONB NOT NULL,          -- полный ответ AssemblyAI
  text_plain TEXT NOT NULL,          -- чистый текст
  words_json JSONB NOT NULL,         -- слова с таймстемпами
  speakers_json JSONB,               -- разметка спикеров
  duration_seconds INTEGER,
  language VARCHAR(10) DEFAULT 'ru',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Профили спикеров
CREATE TABLE speaker_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID,
  speaker_code VARCHAR(20),          -- 'SPEAKER_A'
  display_name VARCHAR(100),         -- 'Денис'
  is_host BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Клип-кандидаты
CREATE TABLE clip_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES episodes(id),
  transcript_id UUID REFERENCES transcripts(id),
  start_time NUMERIC NOT NULL,
  end_time NUMERIC NOT NULL,
  duration NUMERIC GENERATED ALWAYS AS (end_time - start_time) STORED,
  clip_type VARCHAR(20) CHECK (clip_type IN ('short', 'mini_episode')),
  pattern_type VARCHAR(50),
  scores JSONB NOT NULL,             -- {hook, emotional_peak, etc.}
  hook_phrase TEXT,
  one_sentence_value TEXT,
  suggested_titles JSONB,            -- массив строк
  suggested_thumbnail_text JSONB,
  transcript_excerpt TEXT,
  context_notes TEXT,
  status VARCHAR(20) DEFAULT 'candidate' 
    CHECK (status IN ('candidate', 'approved', 'rejected', 'processing', 'done')),
  approved_at TIMESTAMPTZ,
  approved_title TEXT,
  approved_thumbnail_text TEXT,
  target_platforms JSONB DEFAULT '[]', -- ['youtube_shorts', 'reels', 'tiktok']
  aspect_ratio VARCHAR(10) DEFAULT '9:16',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Мини-эпизоды
CREATE TABLE mini_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES episodes(id),
  transcript_id UUID REFERENCES transcripts(id),
  title TEXT,
  narrative_theme TEXT,
  estimated_duration INTEGER,
  segments JSONB NOT NULL,           -- массив {start, end, role, transition}
  bridge_texts JSONB,
  virality_score NUMERIC,
  suggested_titles JSONB,
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Задачи обработки видео
CREATE TABLE clip_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_candidate_id UUID REFERENCES clip_candidates(id),
  job_type VARCHAR(20) CHECK (job_type IN ('cut', 'crop_vertical', 'subtitles', 'export')),
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  ffmpeg_command TEXT,
  input_path TEXT,
  output_path TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Настройки субтитров
CREATE TABLE subtitle_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID,
  name VARCHAR(50),                  -- 'minimal', 'karaoke', 'bold_pop'
  font_family VARCHAR(100),
  font_size INTEGER,
  font_color VARCHAR(20),
  stroke_color VARCHAR(20),
  stroke_width INTEGER,
  position_y_percent INTEGER,
  words_per_frame INTEGER DEFAULT 3,
  highlight_color VARCHAR(20),
  animation_style VARCHAR(20),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_clip_candidates_episode ON clip_candidates(episode_id);
CREATE INDEX idx_clip_candidates_status ON clip_candidates(status);
CREATE INDEX idx_clip_jobs_status ON clip_jobs(status);
CREATE INDEX idx_transcripts_episode ON transcripts(episode_id);
```

---

## 5. API ENDPOINTS

### Next.js API Routes (новые)

```
POST   /api/clips/transcribe          — запуск транскрибации AssemblyAI
GET    /api/clips/transcribe/[jobId]  — статус транскрибации
POST   /api/clips/analyze             — запуск AI-анализа через Claude
GET    /api/clips/candidates/[episodeId] — список кандидатов
PATCH  /api/clips/candidates/[id]     — апрув/отклонение/редактирование
POST   /api/clips/process             — запуск FFmpeg-обработки
GET    /api/clips/jobs/[id]           — статус обработки
GET    /api/clips/export/[id]         — скачать готовый клип
POST   /api/clips/subtitles/[id]      — генерация субтитров
GET    /api/mini-episodes/[episodeId] — список мини-эпизодов
PATCH  /api/mini-episodes/[id]        — редактирование мини-эпизода
```

### AssemblyAI Integration

```typescript
// lib/assemblyai.ts

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

export async function submitTranscription(audioUrl: string) {
  const response = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'authorization': ASSEMBLYAI_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_model: 'best',
      language_code: 'ru',
      speaker_labels: true,
      word_boost: ['ContentOS', 'Личная Философия', 'Offline.Клуб'],
      punctuate: true,
      format_text: true
    })
  });
  return response.json(); // { id, status }
}

export async function pollTranscription(transcriptId: string) {
  const response = await fetch(
    `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
    { headers: { authorization: ASSEMBLYAI_API_KEY } }
  );
  return response.json();
}
```

### Claude API Integration

```typescript
// lib/claude-clips.ts

export async function analyzeTranscript(
  transcript: string, 
  episodeTitle: string,
  guestName: string
): Promise<ClipCandidate[]> {
  
  const systemPrompt = await getPromptFromDB('clip_analysis_v1');
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `
Эпизод: "${episodeTitle}"
Гость: ${guestName}

ТРАНСКРИПТ С ТАЙМКОДАМИ:
${transcript}

Найди 15–25 лучших клип-моментов. 
Верни ТОЛЬКО валидный JSON массив ClipCandidate[].
        `
      }]
    })
  });
  
  const data = await response.json();
  const jsonText = data.content[0].text;
  return JSON.parse(jsonText);
}
```

---

## 6. ПОЛЬЗОВАТЕЛЬСКИЙ ИНТЕРФЕЙС

### 6.1 Новые страницы в ContentOS

```
/clips                          — дашборд всех клипов
/clips/[episodeId]              — работа с клипами конкретного эпизода
/clips/[episodeId]/transcript   — редактор транскрипта
/clips/[episodeId]/queue        — очередь кандидатов (основной экран)
/clips/[episodeId]/mini-episodes — редактор мини-эпизодов
/clips/[clipId]/editor          — детальный редактор одного клипа
/clips/settings                 — настройки (субтитры, промпты, API)
```

### 6.2 Основной экран /clips/[episodeId]/queue

**Layout:** fullscreen двухпанельный

```
┌─────────────────────────┬──────────────────────────────────┐
│  CLIP QUEUE (18)        │                                  │
│  ━━━━━━━━━━━━━━━━━━━━━  │         ВИДЕО ПЛЕЕР              │
│  [Фильтры: All/Short/   │         16:9 / 9:16 toggle       │
│  MiniEp | Sort: Score]  │                                  │
│                         │  ▶ [02:15 ──────●──── 03:47]     │
│  ┌─────────────────┐    │                                  │
│  │ 🟢 94  SHORT    │    │  «Нельзя ложиться спать          │
│  │ [01:26 – 01:55] │    │   уставшим — и вот почему»       │
│  │ counter_intuit. │◄── │                                  │
│  │ "Нельзя ложить- │    │  ┌─── МЕТАДАННЫЕ ───────────┐   │
│  │ ся спать устав- │    │  │ Заголовок: [dropdown v3]  │   │
│  │ шим — это миф"  │    │  │ Текст обложки: [3 вар.]   │   │
│  │ [✓] [✎] [✗]    │    │  │ Платформы: [YT][IG][TT]   │   │
│  └─────────────────┘    │  │ Аспект: [9:16] [16:9]     │   │
│                         │  └─────────────────────────────┘  │
│  ┌─────────────────┐    │                                  │
│  │ 🟢 89  SHORT    │    │  [◄ ПРЕД]  [✓ АПРУВ]  [СЛЕД ►]  │
│  │ [00:42 – 01:12] │    │                                  │
│  │ shock_statistic │    │                                  │
│  └─────────────────┘    │                                  │
│  ...                    │                                  │
└─────────────────────────┴──────────────────────────────────┘
```

### 6.3 Цветовая схема (в рамках существующего дизайна ContentOS)

- Virality Score 80–100: `#22c55e` (зелёный)
- Virality Score 60–79: `#eab308` (жёлтый)
- Virality Score <60: `#6b7280` (серый)
- Паттерн counter_intuitive: `#818cf8` (фиолетовый)
- Паттерн shock_statistic: `#f97316` (оранжевый)
- Паттерн emotional_peak: `#ec4899` (розовый)
- Паттерн practical_protocol: `#14b8a6` (бирюзовый)

### 6.4 Состояния интерфейса

- **Загрузка транскрипта:** spinner + «Транскрибируем аудио... обычно 2–5 минут»
- **AI-анализ:** прогресс-бар + «Ищем лучшие моменты...»
- **Обработка клипа:** прогресс-бар + оставшееся время
- **Ошибка:** красный toast с кнопкой «Повторить»
- **Готово:** зелёный toast + анимация перемещения карточки в Done

---

## 7. НАСТРОЙКИ И КАСТОМИЗАЦИЯ

### 7.1 Страница /clips/settings

**Блок 1: Промпт-система**
- Редактируемый системный промпт для AI-анализа (textarea)
- История версий промптов (откат к предыдущей)
- Тест промпта на последних 5 минутах любого транскрипта

**Блок 2: Субтитры**
- Конфигуратор стиля субтитров с live-preview
- Сохранение нескольких пресетов

**Блок 3: API-ключи**
- AssemblyAI API Key
- Anthropic API Key (если не наследует от основного ContentOS)
- OpusClip API Key (опционально)

**Блок 4: Дефолты**
- Целевые платформы по умолчанию
- Дефолтное аспектное соотношение
- Минимальный порог Virality Score для отображения (слайдер 0–100)
- Максимальное количество кандидатов на эпизод

**Блок 5: Word boost**
- Список слов для улучшения транскрипции (бренды, имена, термины)

---

## 8. БЕЗОПАСНОСТЬ И АПРУВ-ЛОГИКА

**Принцип из основного ContentOS:** ничего не происходит без явного действия пользователя.

- FFmpeg-нарезка **не запускается** без нажатия «Апрув» на конкретном клипе
- Публикация на YouTube/Instagram — только через ручной экспорт и загрузку (Фаза 1), или через явное «Опубликовать» (Фаза 2)
- Все AI-предложения (заголовки, тексты обложек) — только предложения, не действия
- Лог всех действий в таблице `audit_log`: кто, что, когда апрувнул/отклонил

---

## 9. ИНТЕГРАЦИЯ С СУЩЕСТВУЮЩИМ CONTENTОС

### 9.1 Связи с существующими таблицами

```sql
-- clip_candidates ссылается на episodes
-- episodes уже существует в ContentOS
ALTER TABLE clip_candidates 
  ADD CONSTRAINT fk_clip_episode 
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
```

### 9.2 Навигация

Добавить в существующий сайдбар ContentOS:
```
📹 Episodes (существующий)
✂️ Clips (новый)          ← сюда
📊 Analytics (будущее)
⚙️ Settings (существующий)
```

### 9.3 Точка входа в модуль

На странице эпизода (`/episodes/[id]`) добавить кнопку:
```
[✂️ Создать клипы] → /clips/[episodeId]/queue
```

При первом переходе — автоматически запускается транскрибация (если транскрипт ещё не создан).

---

## 10. ФАЗЫ РАЗРАБОТКИ

### Фаза 1 — MVP (приоритет)

**Scope:**
1. Загрузка видео/аудио в Supabase Storage
2. Транскрибация через AssemblyAI с разметкой спикеров
3. AI-анализ через Claude → JSON кандидатов
4. UI очереди кандидатов с плеером
5. Апрув/отклонение/редактирование метаданных
6. FFmpeg-нарезка по таймкодам
7. Базовые субтитры (SRT из AssemblyAI)
8. Скачивание готового клипа

**Не входит в Фазу 1:** публикация, аналитика, мини-эпизоды, karaoke субтитры, OpusClip API.

**Оценка трудоёмкости Фазы 1:** 40–60 часов разработки

### Фаза 2

1. Мини-эпизоды с timeline-редактором
2. Karaoke-субтитры (Submagic/Captions API)
3. AI-рефрейминг лица (OpusClip API)
4. Планировщик публикаций
5. YouTube Shorts API публикация

### Фаза 3

1. Аналитика (реальные метрики vs предсказанный скор)
2. Самообучение модели (какие паттерны реально работают)
3. Instagram Reels API
4. TikTok API

---

## 11. ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

```env
# AssemblyAI
ASSEMBLYAI_API_KEY=

# Claude / Anthropic (если отдельный от основного)
ANTHROPIC_CLIPS_API_KEY=

# OpusClip (Фаза 2)
OPUSCLIP_API_KEY=

# FFmpeg (путь к бинарнику на сервере)
FFMPEG_PATH=/usr/bin/ffmpeg

# Supabase Storage bucket для клипов
CLIPS_STORAGE_BUCKET=clips

# Временная директория для FFmpeg
FFMPEG_TEMP_DIR=/tmp/clips
```

---

## 12. КРИТЕРИИ ПРИЁМКИ (Definition of Done)

### Фаза 1 готова когда:

- [ ] Загрузка MP4/M4A файла работает без ошибок
- [ ] Транскрипт создаётся с временными метками и разметкой спикеров
- [ ] Claude возвращает ≥10 кандидатов для 90-минутного эпизода
- [ ] UI отображает кандидатов с плеером и предпросмотром
- [ ] Апрув запускает FFmpeg-нарезку
- [ ] Готовый клип скачивается в корректном формате
- [ ] Субтитры встроены или доступны как отдельный SRT
- [ ] Весь процесс от загрузки до скачивания проходит без ошибок
- [ ] Ни один файл не генерируется без явного апрува пользователя
- [ ] Все действия логируются в `audit_log`

---

## 13. ВОПРОСЫ К УТОЧНЕНИЮ ПЕРЕД СТАРТОМ

1. **Хостинг FFmpeg:** где планируем держать FFmpeg-воркер? Vercel не поддерживает тяжёлые бинарники — нужен отдельный VPS или Railway/Fly.io
2. **Размер хранилища:** планируемый объём исходников на месяц? Для расчёта Supabase Storage
3. **Транскрипт уже есть?** Для эпизода с Блохиным — есть готовый TXT. Нужно ли импортировать его напрямую (пропустив AssemblyAI)?
4. **Приоритет субтитров:** достаточно SRT для Фазы 1, или нужен karaoke сразу?
5. **OpusClip:** у тебя есть действующий аккаунт OpusClip? Если да — можно подключить как дополнительный источник кандидатов
