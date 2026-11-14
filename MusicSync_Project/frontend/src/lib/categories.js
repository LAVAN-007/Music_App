// How the library's categories are grouped, ordered and coloured in the UI.
// A category the server sends that is not listed here still shows up, under "More".
const GROUPS = [
  { title: 'Moods & styles', items: [
    ['Hits', '#e5484d', 'Chart toppers'],
    ['Love Songs', '#e93d82', 'Romance'],
    ['Melody', '#3e63dd', 'Soft and soothing'],
    ['Sad Songs', '#5b6b8c', 'Heartbreak'],
    ['Mass Songs', '#f76b15', 'Hero anthems'],
    ['Kuthu', '#d6409f', 'Dance beats'],
    ['Folk', '#46a758', 'Village roots'],
    ['Devotional', '#e2a336', 'Bhakti'],
    ['BGM', '#7c66dc', 'Themes and scores'],
  ] },
  { title: 'Composers', items: [
    ['Anirudh', '#12a594', 'Anirudh Ravichander'],
    ['AR Rahman', '#8e4ec6', 'A. R. Rahman'],
    ['Yuvan', '#0090ff', 'Yuvan Shankar Raja'],
    ['Vijay Antony', '#ab4aba', 'Vijay Antony'],
    ['Harris Jayaraj', '#3d9a50', 'Harris Jayaraj'],
  ] },
  { title: 'By year', items: [
    ['2024 Hits', '#e54666', 'Newest'],
    ['2023 Hits', '#dc6a2e', ''],
    ['2022 Hits', '#c2892b', ''],
    ['2000s Hits', '#2f8fa8', ''],
    ['90s Hits', '#6e56cf', 'Classics'],
  ] },
];

const KNOWN = new Map(GROUPS.flatMap(g => g.items.map(([name, color, note]) => [name, { name, color, note }])));
const FALLBACK = '#6f6d7c';

export const categoryOf = (song) => song?.category || 'Other';
export const categoryColor = (name) => KNOWN.get(name)?.color || FALLBACK;

/**
 * Groups the library for browsing.
 * @returns [{ title, items: [{ name, color, note, count, cover }] }], empty categories left out
 */
export function groupCategories(songs) {
  const found = new Map(); // name -> { count, cover }
  for (const song of songs) {
    const name = categoryOf(song);
    const entry = found.get(name);
    if (!entry) found.set(name, { count: 1, cover: song.thumbnail || '' });
    else {
      entry.count++;
      if (!entry.cover && song.thumbnail) entry.cover = song.thumbnail;
    }
  }
  const groups = GROUPS.map(g => ({
    title: g.title,
    items: g.items.filter(([name]) => found.has(name)).map(([name]) => ({ ...KNOWN.get(name), ...found.get(name) })),
  }));
  const extra = [...found.keys()].filter(name => !KNOWN.has(name))
    .map(name => ({ name, color: FALLBACK, note: '', ...found.get(name) }));
  if (extra.length) groups.push({ title: 'More', items: extra });
  return groups.filter(g => g.items.length > 0);
}
