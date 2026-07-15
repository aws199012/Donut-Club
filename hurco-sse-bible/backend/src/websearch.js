import * as cheerio from 'cheerio';

// Pluggable web search: if a real search API key is configured, use it.
// Otherwise fall back to scraping DuckDuckGo's HTML-only endpoint, which
// needs no API key and is fine for a personal local tool. Swap in Bing/Google/
// SerpAPI here for more reliable production-grade results.
export async function searchWeb(query, limit = 5) {
  if (process.env.BING_SEARCH_KEY) {
    return searchBing(query, limit);
  }
  return searchDuckDuckGo(query, limit);
}

async function searchBing(query, limit) {
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${limit}`;
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_SEARCH_KEY },
  });
  if (!res.ok) throw new Error(`Bing search failed: ${res.status}`);
  const data = await res.json();
  return (data.webPages?.value || []).map((r) => ({
    title: r.name,
    url: r.url,
    snippet: r.snippet,
  }));
}

async function searchDuckDuckGo(query, limit) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HurcoSSEBible/1.0)' },
  });
  if (!res.ok) throw new Error(`Web search failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $('.result').each((_, el) => {
    if (results.length >= limit) return;
    const titleEl = $(el).find('.result__a');
    const snippetEl = $(el).find('.result__snippet');
    const title = titleEl.text().trim();
    const href = titleEl.attr('href');
    const snippet = snippetEl.text().trim();
    if (title && href) {
      results.push({ title, url: resolveDuckDuckGoUrl(href), snippet });
    }
  });

  return results;
}

function resolveDuckDuckGoUrl(href) {
  try {
    const parsed = new URL(href, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}
