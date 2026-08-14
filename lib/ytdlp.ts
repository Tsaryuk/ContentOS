// lib/ytdlp.ts
// Общие флаги yt-dlp для вытаскивания аудио с YouTube.
//
// Закрывает две проблемы, найденные 2026-08-14, когда подкаст отказался
// обрабатываться:
//
//  1. Прокси читался из ДВУХ разных переменных: worker.ts брал YTDLP_PROXY
//     (задан), а lib/podcasts/publish-episode.ts — PROXY_URL (пуст). То есть
//     извлечение аудио для подкастов шло без прокси и упало бы на всех 73
//     эпизодах сразу после запуска публикации.
//
//  2. YouTube отвечает «Sign in to confirm you're not a bot» на часть видео,
//     когда запрос идёт с датацентрового IP. Клиенту mweb отдаётся
//     прогрессивный формат 18, который качается без PO-токена. Клиенты
//     default и android_vr показывают adaptive-форматы, а на скачивании дают
//     403 Forbidden. Проверено на эпизоде 5417 сек: mweb вытянул его целиком.
//
// Список клиентов через запятую сознательно НЕ используется: yt-dlp тогда
// откатывается на клиента, чьим форматам нужен PO-токен, и скачивание падает
// в 403. Значение переопределяется через env, чтобы обходить изменения на
// стороне YouTube без деплоя.

const PROXY = process.env.YTDLP_PROXY ?? process.env.PROXY_URL ?? ''
const PLAYER_CLIENT = process.env.YTDLP_PLAYER_CLIENT ?? 'mweb'

/** Прокси + player_client. Ставить первыми в списке аргументов yt-dlp. */
export function ytdlpAudioArgs(): string[] {
  return [
    ...(PROXY ? ['--proxy', PROXY] : []),
    '--extractor-args', `youtube:player_client=${PLAYER_CLIENT}`,
  ]
}

/** Для логов — не раскрывая сам URL прокси (в нём логин и пароль). */
export function ytdlpUsesProxy(): boolean {
  return PROXY !== ''
}
