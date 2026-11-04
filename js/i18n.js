// English or Dutch: the browser's language unless you've picked one (kept for all three games). The English is
// written in place in the code and the pages and is its own key: `t('LAP {0}/{1}', lap, laps)` looks it up in the
// Dutch table and falls back on the English as it stands. A page's own text is put into Dutch by `translatePage`: each
// bit of text that's a key whole, title/placeholder/aria-label attributes too, and an element with `data-t` gets the
// HTML its key gives.
import * as store from './store.js';

const pick = () => {
  const saved = store.load('lang', null);
  if (saved === 'en' || saved === 'nl') return saved;
  const want = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return /^nl\b/i.test(want[0] || '') ? 'nl' : 'en';
};
export const lang = pick();
document.documentElement.lang = lang;

const NL = {}, LISTS = {};
// Each game adds its own Dutch: `words` English → Dutch, `lists` a run of names (its first English one) → its own
// Dutch run, not a word-for-word one
export function addDutch(words = {}, lists = {}) { Object.assign(NL, words); Object.assign(LISTS, lists); }

const fill = (s, args) => (args.length ? s.replace(/\{(\d)\}/g, (_, i) => args[i]) : s);
export function t(en, ...args) { return fill(lang === 'nl' && NL[en] != null ? NL[en] : en, args); }
// (a run of names, for one picked at random)
export function tl(list) { return (lang === 'nl' && LISTS[list[0]]) || list; }

// 1st, 2nd, 3rd… or 1e, 2e, 3e…
export function ordinal(n) {
  if (lang === 'nl') return n + 'e';
  return n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
}

export function setLang(l) { store.save('lang', l); location.reload(); }

export function translatePage(root = document.body) {
  if (lang === 'en') return;
  document.title = t(document.title);
  for (const el of root.querySelectorAll('[data-t]')) if (NL[el.dataset.t] != null) el.innerHTML = NL[el.dataset.t];
  for (const el of root.querySelectorAll('[title],[placeholder],[aria-label]')) {
    for (const a of ['title', 'placeholder', 'aria-label']) if (el.hasAttribute(a)) el.setAttribute(a, t(el.getAttribute(a)));
  }
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    const s = n.nodeValue.trim();
    if (s && NL[s] != null) n.nodeValue = n.nodeValue.replace(s, NL[s]);
  }
}

// The switch: a button that says the other language, in that language
export function langButton(className = 'link') {
  const b = document.createElement('button');
  b.className = className + ' lang';
  b.textContent = lang === 'nl' ? 'English' : 'Nederlands';
  b.onclick = () => setLang(lang === 'nl' ? 'en' : 'nl');
  return b;
}
