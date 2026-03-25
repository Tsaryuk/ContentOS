# ContentOS Dashboard — Design Spec

## Overview

Главная страница (`/`) ContentOS — командный центр медиа-бренда "Денис Царюк". Агрегирует статистику по всем каналам и платформам, предоставляет быструю навигацию к каждому каналу и показывает AI-инсайты.

Дашборд работает как хаб: показывает сводку и метрики, клик по каналу ведёт на отдельную страницу канала (например, текущая `/youtube`).

## Каналы и платформы

### YouTube (API подключён)
- **Личная Философия** — основной канал, ~66K подписчиков
- **Долг и Деньги** — финансовый канал
- **Жизнь как искусство** — личный канал

### YouTube Shorts (отдельный)
- **Денис Царюк Shorts**

### Telegram
- **Денис Царюк**

### Instagram
- **Личный аккаунт**
- **Личная Философия** (канал)

### TikTok
- **Денис Царюк**

### Threads
- **Денис Царюк**

### Email (Unisender)
- **Рассылка** (~5000 подписчиков)

### Сайт
- **tsaryuk.ru**

## Архитектура страницы

### Layout: Sidebar + Content

Глобальный layout (`app/layout.tsx`) оборачивает все страницы в структуру с боковым меню. Текущая страница `/youtube` тоже получает сайдбар.

```
┌──────┬──────────────────────────────────────┐
│ Side │  Content area (page-specific)        │
│ bar  │                                      │
│ 52px │                                      │
│      │                                      │
└──────┴──────────────────────────────────────┘
```

### Sidebar — гибридный (collapsed + hover flyout)

**По умолчанию:** узкая полоса 52px с иконками.

**При hover на иконку платформы:** появляется flyout-панель (~200px) со списком каналов этой платформы. Flyout исчезает при уходе курсора.

**Структура сайдбара (сверху вниз):**

1. **Логотип** — "C" на градиенте `#6b9ff0` → `#a67ff0`, 32x32, border-radius 8px
2. **Разделитель** — `rgba(255,255,255,0.06)`, 24px ширина
3. **Навигация платформ:**
   - Дашборд (grid icon) — активный: `rgba(107,159,240,0.12)` фон
   - YouTube (лого) — flyout: список 3 каналов + shorts
   - Telegram (лого)
   - Instagram (лого) — flyout: 2 аккаунта
   - TikTok (лого)
   - Email (envelope icon)
   - Сайт (globe icon)
   - Threads (лого)
4. **Spacer** — `flex: 1`
5. **Переключатель темы** — sun/moon icon
6. **Настройки** — gear icon

**Flyout:**
- Появляется справа от сайдбара при hover на иконку платформы
- Фон: `#161618` (dark) / `#fff` (light)
- Border: `1px solid rgba(255,255,255,0.08)`
- Shadow: `0 8px 32px rgba(0,0,0,0.5)`
- Содержит список каналов платформы с названиями
- Клик по каналу → переход на страницу канала

### Компонент: `Sidebar`

Файл: `components/layout/Sidebar.tsx`

Props: нет (использует `usePathname()` для подсветки активного элемента).

Состояние:
- `hoveredPlatform: string | null` — какая платформа в hover (для flyout)

## Страница `/` — Dashboard

### Секция 1: Header

```
Денис Царюк                              Обновлено 5 мин назад
Медиа • 10 каналов • 5 платформ
```

- Заголовок: 18px, font-weight 600, цвет `cream` / `#1a1a1a`
- Подзаголовок: 11px, `white/35` / `black/40`
- Справа: timestamp последнего обновления данных

### Секция 2: Hero Metrics — 4 карточки в ряд

| Метрика | Цвет значения | Источник |
|---------|---------------|----------|
| Подписчики (суммарно) | `accent` (#6b9ff0) | Сумма по всем каналам |
| Просмотры (суммарно) | `purple` (#a67ff0) | Сумма по всем каналам |
| Контент (кол-во публикаций) | `cream` / `#1a1a1a` | Счётчик публикаций |
| Engagement (средний %) | `green` (#4ade80 dark / #16a34a light) | Среднее взвешенное по подключённым каналам |

Каждая карточка:
- Фон: `rgba(255,255,255,0.03)` (dark) / `#fff` с `box-shadow: 0 1px 3px rgba(0,0,0,0.04)` (light)
- Border: `1px solid rgba(255,255,255,0.06)` (dark) / `rgba(0,0,0,0.08)` (light)
- Border-radius: 12px
- Padding: 16px
- Лейбл: 10px, uppercase, letter-spacing 0.5px, `white/35`
- Значение: 24px, font-weight 600
- Рост: 10px, зелёный для +, жёлтый для -, текст "за месяц"

**Данные:** YouTube каналы — реальные данные из Supabase. Остальные — заглушки (hardcoded или из конфига). При подключении API платформы — данные заменяются на реальные.

### Секция 3: Filter Tabs

Горизонтальный ряд pill-кнопок с Framer Motion `layoutId` анимацией (как на `/youtube`).

Табы: `Все каналы` | `YouTube (3)` | `Telegram (1)` | `Instagram (2)` | `TikTok (1)` | `Email (1)` | `Сайт (1)` | `Threads (1)` | `Shorts (1)`

- Активный таб: `rgba(107,159,240,0.15)` фон, `#6b9ff0` текст, border `rgba(107,159,240,0.25)`
- Неактивный: `rgba(255,255,255,0.03)` фон, `white/40` текст
- Каунтер: `white/20` после названия
- При переключении — фильтрует сетку каналов ниже с `motion` анимацией

### Секция 4: Channel Grid — 3 колонки

Сетка карточек каналов. Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, gap 12px.

**Карточка подключённого канала:**
```
┌─────────────────────────────────┐
│ [icon] Название канала    +1.8% │
│                                 │
│ 66.1K        11.6M              │
│ подписчики   просмотры          │
│                                 │
│ 142 видео • Подключено          │
└─────────────────────────────────┘
```

- Иконка платформы (цветная, 16px)
- Название канала: 12px, font-weight 500
- Badge роста: зелёный фон `rgba(74,222,128,0.1)`, текст `#4ade80`
- Метрики: подписчики (accent цвет, 18px bold), просмотры (white/70, 18px bold)
- Footer: кол-во контента + статус подключения, 9px, `white/30`
- Hover: `borderColor → rgba(255,255,255,0.12)`
- Клик: `router.push('/youtube')` или `/channel/[slug]`

**Карточка неподключённого канала:**
- Opacity: 0.6
- Вместо метрик: "API не подключён" (14px, white/20, по центру)
- Footer: "Нажмите для настройки"
- Badge: "скоро" вместо процента роста
- Клик: открывает модалку/страницу настройки интеграции

### Секция 5: AI Insights Bar

Компактная горизонтальная полоса внизу страницы.

```
⚡ AI Инсайты  |  [3] идеи для контента  |  [2] упоминания  |  [1] задача требует внимания  |  Открыть →
```

- Фон: `rgba(255,255,255,0.02)`, border, border-radius 12px
- Каунтеры — цветные pill-badges:
  - Идеи: accent (`#6b9ff0`)
  - Упоминания: purple (`#a67ff0`)
  - Задачи: warn (`#f0b84a`)
- "Открыть →" — ведёт на отдельную страницу AI инсайтов (будущее)
- Данные: генерируются через Claude API (GPT/Claude) по расписанию или по запросу

## Тема: Dark / Light

### Переключатель
- Иконка sun/moon в сайдбаре
- Клик переключает класс на `<html>`: `dark` / `light`
- Сохраняется в `localStorage('theme')`
- По умолчанию: `dark`
- Respects `prefers-color-scheme` при первом визите

### Палитра

| Токен | Dark | Light |
|-------|------|-------|
| `--bg` | `#09090b` | `#fafaf9` |
| `--bg-surface` | `rgba(255,255,255,0.03)` | `#ffffff` |
| `--bg-sidebar` | `#0e0e10` | `#f0f0ee` |
| `--border` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.08)` |
| `--text-primary` | `#f0ede8` | `#1a1a1a` |
| `--text-secondary` | `rgba(255,255,255,0.4)` | `rgba(0,0,0,0.4)` |
| `--text-tertiary` | `rgba(255,255,255,0.2)` | `rgba(0,0,0,0.25)` |
| `--accent` | `#6b9ff0` | `#4a7fd4` |
| `--purple` | `#a67ff0` | `#8b5cf6` |
| `--green` | `#4ade80` | `#16a34a` |
| `--warn` | `#f0b84a` | `#f59e0b` |
| `--shadow` | none | `0 1px 3px rgba(0,0,0,0.04)` |

### Реализация

CSS-переменные в `globals.css`:
```css
:root { /* light */ }
.dark { /* dark overrides */ }
```

Tailwind `darkMode: 'class'` в `tailwind.config.ts`. Компоненты используют `dark:` префикс.

**Миграция цветовых токенов:**
- Статические цвета в `tailwind.config.ts` (`bg`, `surface`, `border`, `cream` и т.д.) заменяются на CSS-переменные: `bg: 'var(--bg)'`, `surface: 'var(--bg-surface)'` и т.д.
- Существующая страница `/youtube` продолжит работать без изменений — её hardcoded значения (`bg-[#09090b]`, `text-white`) совпадают с dark-темой, а миграция на CSS-переменные будет отдельным follow-up.
- Канонический зелёный: `#4ade80` (dark) / `#16a34a` (light). Старый `#4caf82` из `tailwind.config.ts` заменяется.

## Файловая структура (новые файлы)

```
components/
  layout/
    Sidebar.tsx           — гибридный сайдбар с flyout
    SidebarFlyout.tsx     — flyout-панель для платформы
    ThemeToggle.tsx        — переключатель dark/light
  dashboard/
    HeroMetrics.tsx        — 4 метрики-карточки
    ChannelGrid.tsx        — сетка каналов
    ChannelCard.tsx        — карточка канала (connected / placeholder)
    FilterTabs.tsx         — табы фильтрации по платформам
    AiInsightsBar.tsx      — компактная AI-полоса
lib/
  theme.ts                 — хук useTheme(), localStorage
  channels.ts              — конфиг каналов, типы, заглушки
app/
  layout.tsx               — обновить: обернуть в Sidebar
  page.tsx                 — заменить: Dashboard
  globals.css              — обновить: CSS-переменные для тем
tailwind.config.ts         — обновить: darkMode: 'class', content: добавить './components/**/*.{ts,tsx}', цвета на CSS-переменные
```

## Данные

### Тип `Channel`

```typescript
type Platform = 'youtube' | 'youtube-shorts' | 'telegram' | 'instagram' | 'tiktok' | 'threads' | 'email' | 'website'

type Channel = {
  id: string
  name: string
  platform: Platform
  slug: string                    // для URL: /channel/[slug]
  icon?: string                   // override для иконки
  connected: boolean
  metrics: {
    subscribers: number
    views: number
    contentCount: number
    growthPercent: number          // за последний месяц
    engagement?: number           // engagement rate в процентах
  } | null                        // null если не подключён
  href: string                    // куда ведёт клик (/youtube, /channel/x)
}
```

**Engagement формула (YouTube):** `(like_count / view_count) * 100`. Если данных недостаточно (< 5 видео или нет просмотров), карточка показывает "--" вместо числа.

**Агрегация Hero метрик:**
- Подписчики / Просмотры / Контент: сумма по каналам с `connected: true`
- Engagement: среднее взвешенное по просмотрам среди подключённых каналов. "--" если нет данных.
```

### Источники данных

- **YouTube:** реальные данные из `yt_videos` и `yt_channels` (Supabase)
- **Остальные платформы:** конфиг в `lib/channels.ts` с `connected: false` и `metrics: null`
- **Hero метрики:** агрегация по всем каналам с `connected: true`

## Интеграция с существующими страницами

Добавление глобального сайдбара через `layout.tsx` затрагивает существующую страницу `/youtube`. Необходимые изменения:

- Удалить `min-h-screen` и `bg-[#09090b]` из корневого `<div>` в `/youtube/page.tsx` — фон и высота теперь приходят из layout
- Контент-область внутри layout занимает `flex: 1` и `overflow-y: auto`
- Хедер страницы `/youtube` (breadcrumb, кнопка синхронизации) остаётся без изменений — он специфичен для модуля YouTube

## Что НЕ входит в scope

- Страницы отдельных каналов (кроме существующей `/youtube`)
- Страница AI инсайтов (только bar со ссылкой)
- Модалка настройки интеграции (только placeholder-ссылка)
- Реальные данные для платформ кроме YouTube
- Графики и чарты (будущее)
- Мобильная адаптация сайдбара (будущее, сейчас desktop-first)
- Полная миграция `/youtube` на CSS-переменные (follow-up)
