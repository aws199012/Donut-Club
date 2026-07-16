// Fully local knowledge-graph extraction: no API calls, no LLM cost. Runs once per
// document/ticket write (see routes/documents.js, routes/tickets.js) and the result
// is cached as JSON on the record — search-time aggregation (see search.js) just
// merges these precomputed pieces, it never re-parses document text.
//
// This is heuristic, not true language understanding. Expect some noise (a place
// name mistaken for a person, a stray short phrase as a "keyword") — tune
// RAKE_STOPWORDS / ACTION_VERBS / domainDictionary.js below as bad cases turn up.
import nlp from 'compromise';
import { FLAT_DICTIONARY } from './domainDictionary.js';

// compromise's organization tagger fires on short all-caps tech abbreviations that
// are common in this domain but aren't really "companies" (e.g. "OS" in "32-bit OS").
// Small, targeted list — add to it as more false positives turn up.
const ORG_FALSE_POSITIVES = new Set(['os', 'pc', 'it', 'id']);

const ACTION_VERBS = [
  'replaced', 'installed', 'updated', 'failed', 'fixed', 'upgraded', 'reported',
  'occurred', 'changed', 'configured', 'reset', 'repaired', 'diagnosed', 'resolved',
  'called', 'shipped', 'ordered', 'scheduled', 'completed', 'discovered', 'found',
  'noticed', 'contacted', 'visited', 'sent', 'received', 'tested', 'verified',
  'escalated', 'closed', 'opened', 'reproduced',
];

const RAKE_STOPWORDS = new Set(
  (
    'a about above after again against all am an and any are aren as at be because been ' +
    'before being below between both but by can cannot could did do does doing down during ' +
    'each few for from further had has have having he her here hers herself him himself his ' +
    'how i if in into is it its itself just me more most my myself no nor not now of off on ' +
    'once only or other our ours ourselves out over own same she should so some such than that ' +
    'the their theirs them themselves then there these they this those through to too under ' +
    'until up very was we were what when where which while who whom why will with would you ' +
    'your yours yourself yourselves also may might must shall one two three per via etc'
  ).split(' ')
);

function cleanEntityText(s) {
  return (s || '').replace(/^[^\w]+|[^\w]+$/g, '').trim();
}

function splitParagraphs(text) {
  if (!text) return [];
  const byBlankLine = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  // No blank-line paragraph breaks (common for ticket fields) — fall back to
  // grouping sentences into ~3-sentence chunks as a stand-in for "section".
  const sentences = nlp(text).sentences().out('array');
  if (sentences.length <= 1) return [text.trim()].filter(Boolean);
  const chunks = [];
  for (let i = 0; i < sentences.length; i += 3) {
    chunks.push(sentences.slice(i, i + 3).join(' '));
  }
  return chunks;
}

function matchDictionaryTerms(paragraph) {
  const found = [];
  const usedSpans = [];
  for (const { term, category } of FLAT_DICTIONARY) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    let m;
    while ((m = re.exec(paragraph))) {
      const start = m.index;
      const end = start + m[0].length;
      const overlapsExisting = usedSpans.some(([s, e]) => start < e && end > s);
      if (!overlapsExisting) {
        found.push({ text: term, category });
        usedSpans.push([start, end]);
      }
    }
  }
  return found;
}

function extractParagraphEntities(paragraph) {
  // Domain-dictionary matches take priority over generic NLP tags for the same text
  // (e.g. compromise sometimes tags "VPN" as an organization; the dictionary already
  // knows it's a technology term, which is the more useful/accurate category here).
  const dictMatches = matchDictionaryTerms(paragraph);
  const dictTextSet = new Set(dictMatches.map((d) => d.text.toLowerCase()));

  const doc = nlp(paragraph);
  const generic = [
    ...doc.people().out('array').map((t) => ({ text: cleanEntityText(t), category: 'person' })),
    ...doc
      .organizations()
      .out('array')
      .map((t) => ({ text: cleanEntityText(t), category: 'company' }))
      .filter((e) => !ORG_FALSE_POSITIVES.has(e.text.toLowerCase())),
    ...doc.places().out('array').map((t) => ({ text: cleanEntityText(t), category: 'place' })),
    ...doc
      .match('#Date+')
      .out('array')
      .map((t) => ({ text: cleanEntityText(t), category: 'date' }))
      // A dotted string of 3+ number groups (e.g. "09.01.290.01") is a software
      // version number in this domain, not a date — compromise's date tagger
      // doesn't know the difference, so filter it out here.
      .filter((e) => !/^\d+(\.\d+){2,}$/.test(e.text)),
  ].filter((e) => e.text && !dictTextSet.has(e.text.toLowerCase()));

  const raw = [...generic, ...dictMatches];

  const seen = new Map();
  for (const e of raw) {
    if (!e.text || e.text.length < 2) continue;
    const key = `${e.category}:${e.text.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()];
}

// RAKE-lite: stopword-delimited candidate phrases, scored by (word degree + word
// frequency) / word frequency, summed per phrase. Feeds node "importance" alongside
// raw occurrence count.
function rakeKeywords(text, topN = 15) {
  const sentences = text.split(/[.!?\n]+/);
  const candidatePhrases = [];

  for (const sentence of sentences) {
    const words = sentence.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [];
    let phrase = [];
    for (const w of words) {
      if (RAKE_STOPWORDS.has(w)) {
        if (phrase.length) candidatePhrases.push(phrase.join(' '));
        phrase = [];
      } else {
        phrase.push(w);
      }
    }
    if (phrase.length) candidatePhrases.push(phrase.join(' '));
  }

  const freq = new Map();
  const degree = new Map();
  for (const phrase of candidatePhrases) {
    const words = phrase.split(' ');
    const wordDegree = words.length - 1;
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
      degree.set(w, (degree.get(w) || 0) + wordDegree);
    }
  }

  const wordScore = new Map();
  for (const w of freq.keys()) {
    wordScore.set(w, (degree.get(w) + freq.get(w)) / freq.get(w));
  }

  const phraseScores = new Map();
  for (const phrase of candidatePhrases) {
    if (phrase.length < 3 || /^\d+$/.test(phrase)) continue;
    const score = phrase.split(' ').reduce((sum, w) => sum + (wordScore.get(w) || 0), 0);
    phraseScores.set(phrase, Math.max(phraseScores.get(phrase) || 0, score));
  }

  return [...phraseScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([phrase, score]) => ({ phrase, score: Math.round(score * 100) / 100 }));
}

// Heuristic, not grammatical analysis: a sentence containing both a date-like token
// and a known action verb is treated as a candidate "event". Good enough to surface
// candidates, not a guarantee of precision.
function extractEvents(text) {
  const doc = nlp(text);
  const events = [];
  const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

  for (const sentenceText of doc.sentences().out('array')) {
    const hasDate = DATE_RE.test(sentenceText) || nlp(sentenceText).match('#Date+').found;
    if (!hasDate) continue;
    const lower = sentenceText.toLowerCase();
    if (ACTION_VERBS.some((v) => lower.includes(v))) {
      events.push({ text: sentenceText.trim() });
    }
  }
  return events;
}

// Main entrypoint: run the whole local pipeline over one document/ticket's text and
// return a JSON-serializable structure to store on the record.
export function extractGraphData(text) {
  const cleanText = (text || '').trim();
  if (!cleanText) return { entities: [], relationships: [], keywords: [], events: [] };

  const paragraphs = splitParagraphs(cleanText);
  const entityTotals = new Map();
  const pairTotals = new Map();

  for (const paragraph of paragraphs) {
    const entities = extractParagraphEntities(paragraph);
    if (!entities.length) continue;

    const excerpt = paragraph.length > 320 ? `${paragraph.slice(0, 317)}...` : paragraph;

    for (const e of entities) {
      const key = `${e.category}:${e.text.toLowerCase()}`;
      if (!entityTotals.has(key)) {
        entityTotals.set(key, { key, text: e.text, category: e.category, count: 0, excerpts: [] });
      }
      const rec = entityTotals.get(key);
      rec.count += 1;
      if (rec.excerpts.length < 5 && !rec.excerpts.includes(excerpt)) rec.excerpts.push(excerpt);
    }

    const uniqueKeys = [...new Set(entities.map((e) => `${e.category}:${e.text.toLowerCase()}`))];
    for (let i = 0; i < uniqueKeys.length; i++) {
      for (let j = i + 1; j < uniqueKeys.length; j++) {
        const pairKey = [uniqueKeys[i], uniqueKeys[j]].sort().join('~~');
        if (!pairTotals.has(pairKey)) {
          const [a, b] = pairKey.split('~~');
          pairTotals.set(pairKey, { a, b, count: 0, excerpts: [] });
        }
        const rec = pairTotals.get(pairKey);
        rec.count += 1;
        if (rec.excerpts.length < 5 && !rec.excerpts.includes(excerpt)) rec.excerpts.push(excerpt);
      }
    }
  }

  const keywords = rakeKeywords(cleanText);
  const keywordPhrases = keywords.map((k) => k.phrase);

  const entities = [...entityTotals.values()].map((e) => {
    const boosted = keywordPhrases.some((p) => p.includes(e.text.toLowerCase()));
    return { ...e, importance: e.count * (boosted ? 1.5 : 1) };
  });

  // Link each candidate event to whichever already-extracted entities its sentence
  // mentions (plain substring containment — cheap and good enough for a heuristic
  // pass), so events can appear as their own nodes in the graph, connected outward.
  const events = extractEvents(cleanText).map((ev, idx) => {
    const lower = ev.text.toLowerCase();
    const relatedEntityKeys = entities
      .filter((e) => lower.includes(e.text.toLowerCase()))
      .map((e) => e.key);
    return { key: `event:${idx}`, text: ev.text, relatedEntityKeys };
  });

  return {
    entities,
    relationships: [...pairTotals.values()],
    keywords,
    events,
  };
}
