<?php
// Central article renderer for letters.tsaryuk.ru.
//
// ContentOS uploads a per-article JSON file to articles/{slug}.json with the
// body (already sanitized server-side) and metadata. This file assembles the
// shell (header, meta tags, footer, external menu.js / metrika.js) and echoes
// the body. Editing the shell here applies to every article immediately —
// no republish needed — which is the whole point of the split.
//
// Legacy articles/{slug}.html files stay on disk. The .htaccess rewrite
// only sends requests to this script when a matching .json exists.

declare(strict_types=1);

$slug = isset($_GET['slug']) ? (string)$_GET['slug'] : '';

// Slug allowlist mirrors the SLUG_RE in lib/articles/publish.ts so bad input
// never reaches the filesystem.
if ($slug === '' || !preg_match('/^[a-z0-9][a-z0-9-]{0,100}$/', $slug)) {
  http_response_code(404);
  exit('Not found');
}

$jsonPath = __DIR__ . '/articles/' . $slug . '.json';
if (!is_file($jsonPath)) {
  http_response_code(404);
  exit('Not found');
}

$raw = file_get_contents($jsonPath);
if ($raw === false) {
  http_response_code(500);
  exit('Failed to read article');
}

$data = json_decode($raw, true);
if (!is_array($data)) {
  http_response_code(500);
  exit('Corrupt article data');
}

$title       = isset($data['title'])       ? (string)$data['title']       : '';
$subtitle    = isset($data['subtitle'])    ? (string)$data['subtitle']    : '';
$description = isset($data['description']) ? (string)$data['description'] : $subtitle;
$category    = isset($data['category'])    ? (string)$data['category']    : '';
// Multi-select rubrics; fall back to `category` for legacy payloads where
// tags wasn't present yet.
$tags        = isset($data['tags']) && is_array($data['tags']) ? $data['tags'] : [];
if (!$tags && $category !== '') $tags = [$category];
$date        = isset($data['date'])        ? (string)$data['date']        : '';
$coverUrl    = isset($data['cover_url'])   ? (string)$data['cover_url']   : '';
$showCover   = !isset($data['show_cover_in_article']) || $data['show_cover_in_article'] !== false;
// body_html is sanitized by lib/sanitize.ts on the server before upload;
// we echo it as-is here.
$bodyHtml    = isset($data['body_html'])   ? (string)$data['body_html']   : '';

function esc(string $s): string {
  return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

$canonical = 'https://letters.tsaryuk.ru/articles/' . rawurlencode($slug);
$ogImage   = $coverUrl;
?>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title><?= esc($title) ?> — Личная Стратегия</title>
<meta name="description" content="<?= esc($description) ?>">
<meta property="og:title" content="<?= esc($title) ?>">
<meta property="og:description" content="<?= esc($description) ?>">
<meta property="og:image" content="<?= esc($ogImage) ?>">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Личная Стратегия">
<meta property="og:url" content="<?= esc($canonical) ?>">
<link rel="canonical" href="<?= esc($canonical) ?>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/article.css?v=4">
</head>
<body>

<header class="header">
  <div class="header-inner">
    <a href="/" class="back">&larr; Выпуски</a>
    <a href="/" class="logo">ЛИЧНАЯ СТРАТЕГИЯ</a>
  </div>
</header>

<article class="article">
  <div class="article-cat">
<?php foreach ($tags as $t): ?>
    <a href="/#archive" class="article-tag"><?= esc((string)$t) ?></a>
<?php endforeach; ?>
  </div>
  <h1 class="article-title"><?= esc($title) ?></h1>
  <p class="article-sub"><?= esc($subtitle) ?></p>

  <div class="author">
    <img class="author-photo" src="/assets/img/author.jpg" alt="Денис Царюк">
    <div class="author-info">
      <span class="author-name">Денис Царюк</span>
      <span class="author-date"><?= esc($date) ?></span>
    </div>
  </div>

  <?php if ($showCover && $coverUrl): ?>
    <img class="article-cover" src="<?= esc($coverUrl) ?>" alt="<?= esc($title) ?>">
  <?php endif; ?>

  <div class="article-body">
    <?= $bodyHtml ?>
  </div>

  <div class="share-bar">
    <span class="share-label">Поделиться</span>
    <a id="shareTelegramBtn" class="share-btn" href="#" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
      Telegram
    </a>
    <a id="copyLinkBtn" class="share-btn" href="#">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      Скопировать ссылку
    </a>
  </div>

  <div class="subscribe-cta">
    <h3>Это письмо из рассылки</h3>
    <p>Каждую неделю одно честное письмо. Подпишитесь, чтобы не пропустить.</p>
    <form class="subscribe-form" id="subscribeForm">
      <input type="email" placeholder="Ваш email" required id="emailInput">
      <button type="submit">Подписаться</button>
    </form>
  </div>
</article>

<footer class="footer">
  <a href="https://tsaryuk.ru">Сайт автора</a>
  <a href="https://t.me/tsaryuk_ru">Telegram</a>
  <a href="https://youtube.com/@tsaryuk">YouTube</a>
  <div style="margin-top:8px">&copy; Денис Царюк, <?= date('Y') ?></div>
</footer>

<script src="/assets/article.js"></script>

<!-- External shell: edits to menu.js / metrika.js on tsaryuk.ru apply to
     all articles immediately (see D1 fix). -->
<script src="https://tsaryuk.ru/menu.js" defer></script>
<script src="https://tsaryuk.ru/metrika.js" defer></script>
</body>
</html>
