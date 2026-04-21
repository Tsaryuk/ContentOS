// Single source of truth for blog "rubrics" / article categories.
// Kept here (not in a DB table) because the list is stable and the static
// letters.tsaryuk.ru site navigates by the same labels — changing the
// constant here + updating services/letters-site/{index,archive}.html +
// article.php is the whole migration.
//
// Articles persist selected rubrics in `tags: string[]`; the deprecated
// singular `category` column is kept in sync with tags[0] for backward
// compatibility with older code paths and the pre-tags blog archive.

export const ARTICLE_CATEGORIES = [
  'Мышление',
  'Деньги',
  'Отношения',
  'Стратегия',
  'AI',
  'Будущее',
  'Путешествия',
] as const

export type ArticleCategory = typeof ARTICLE_CATEGORIES[number]
