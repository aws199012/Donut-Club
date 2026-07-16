import { useEffect, useMemo, useState } from 'react';
import LocalResultsList from './LocalResultsList.jsx';
import KnowledgeGraph from './KnowledgeGraph.jsx';
import { CATEGORY_COLORS, CATEGORY_SINGULAR } from './entityCategories.js';

// Structured, readable replacement for the old full-results force graph: a
// dashboard of category cards fed by the same local extraction pipeline. The only
// node/edge visual left is the Entity Explorer, which is scoped to one entity and
// its direct neighbors and only appears when explicitly asked for.

const MIN_ENTITIES_FOR_DASHBOARD = 3;

// Dashboard card order/titles (brief's section names mapped onto the extraction
// pipeline's categories). Cards with no entities for the current search are hidden.
const SECTIONS = [
  { category: 'person', title: 'People' },
  { category: 'company', title: 'Companies' },
  { category: 'technology', title: 'Technologies' },
  { category: 'software', title: 'Software' },
  { category: 'part', title: 'Parts & Products' },
  { category: 'alarm', title: 'Risks / Issues' },
  { category: 'event', title: 'Events' },
  { category: 'place', title: 'Locations' },
  { category: 'date', title: 'Dates' },
];

const CONCEPT_CATEGORIES = new Set(['technology', 'software', 'part', 'alarm']);

function entityDomId(key) {
  return `dash-ent-${encodeURIComponent(key)}`;
}

const MONTH_DATE_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.? \d{1,2},? \d{4}\b/i;

// Best-effort chronological parsing. Returns a timestamp, or null for relative
// mentions ("Tuesday", "yesterday") that can't be pinned to a real date.
function parseDateText(text) {
  const t = (text || '').trim();
  const slash = t.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
  if (slash) {
    const d = new Date(slash[0]);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const iso = t.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso) {
    const d = new Date(iso[0]);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const monthly = t.match(MONTH_DATE_RE);
  if (monthly) {
    const d = new Date(monthly[0]);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

// Scope the full result graph down to one entity + its direct neighbors (1 hop) —
// the only place a node/edge visual is ever shown.
function buildScopedGraph(graph, centerKey) {
  const keep = new Set([centerKey]);
  for (const e of graph.edges) {
    if (e.kind === 'relevance') continue;
    if (e.a === centerKey) keep.add(e.b);
    else if (e.b === centerKey) keep.add(e.a);
  }
  const edges = graph.edges.filter(
    (e) => e.kind !== 'relevance' && keep.has(e.a) && keep.has(e.b)
  );
  const nodes = graph.nodes
    .filter((n) => keep.has(n.key))
    .map((n) => ({ ...n, isCentral: n.key === centerKey, initial: true }));
  const center = nodes.find((n) => n.isCentral);
  return {
    query: center?.text || '',
    forceRender: true,
    nodes,
    edges,
    meta: {
      matchedSources: graph.meta.matchedSources,
      entityCount: Math.max(nodes.length - 1, 0),
      eventCount: 0,
      relationshipCount: edges.length,
      truncated: false,
      totalBeforeTruncation: nodes.length,
    },
  };
}

// Greedy co-occurrence clustering for the Concept Clusters view: strongest
// unassigned entity seeds a cluster and pulls in its most strongly linked
// unassigned neighbors. Purely local heuristics — no semantics beyond "these
// terms keep showing up in the same paragraphs".
function buildClusters(entities, adjacency) {
  const pool = entities
    .filter((e) => CONCEPT_CATEGORIES.has(e.category))
    .sort((a, b) => b.importance - a.importance);
  const poolKeys = new Set(pool.map((e) => e.key));
  const assigned = new Set();
  const clusters = [];

  for (const seed of pool) {
    if (assigned.has(seed.key)) continue;
    assigned.add(seed.key);
    const members = [seed];
    const linked = (adjacency.get(seed.key) || [])
      .filter((r) => poolKeys.has(r.key) && !assigned.has(r.key))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
    for (const r of linked) {
      assigned.add(r.key);
      members.push(entities.find((e) => e.key === r.key));
    }
    clusters.push({ name: seed.text, members: members.filter(Boolean) });
  }

  const real = clusters.filter((c) => c.members.length >= 2);
  const singles = clusters.filter((c) => c.members.length < 2).flatMap((c) => c.members);
  if (singles.length >= 2) real.push({ name: 'Other mentions', members: singles });
  return real;
}

export default function KnowledgeDashboard({ graph, local, onOpenDocument, onOpenTicket }) {
  const entities = useMemo(() => graph.nodes.filter((n) => !n.isCentral), [graph]);
  const nodeByKey = useMemo(() => new Map(graph.nodes.map((n) => [n.key, n])), [graph]);

  const adjacency = useMemo(() => {
    const map = new Map();
    for (const e of graph.edges) {
      if (e.kind === 'relevance') continue;
      if (!map.has(e.a)) map.set(e.a, []);
      if (!map.has(e.b)) map.set(e.b, []);
      map.get(e.a).push({ key: e.b, weight: e.weight, edge: e });
      map.get(e.b).push({ key: e.a, weight: e.weight, edge: e });
    }
    return map;
  }, [graph]);

  const byCategory = useMemo(() => {
    const map = {};
    for (const e of entities) {
      (map[e.category] ||= []).push(e);
    }
    for (const list of Object.values(map)) list.sort((a, b) => b.importance - a.importance);
    return map;
  }, [entities]);

  const evidence = useMemo(() => {
    const map = new Map();
    for (const n of entities) {
      for (const s of n.sources || []) {
        for (const ex of s.excerpts || []) {
          if (!map.has(ex)) {
            map.set(ex, { excerpt: ex, sourceType: s.type, sourceId: s.id, sourceTitle: s.title });
          }
        }
      }
    }
    return [...map.values()];
  }, [entities]);

  const clusters = useMemo(() => buildClusters(entities, adjacency), [entities, adjacency]);

  const timelineItems = useMemo(() => {
    const items = [];
    for (const e of byCategory.date || []) {
      const excerpt = e.sources?.[0]?.excerpts?.[0] || '';
      items.push({ key: e.key, label: e.text, ts: parseDateText(e.text), excerpt, sources: e.sources || [] });
    }
    for (const e of byCategory.event || []) {
      items.push({ key: e.key, label: e.text, ts: parseDateText(e.text), excerpt: e.text, sources: e.sources || [] });
    }
    const dated = items.filter((i) => i.ts !== null).sort((a, b) => a.ts - b.ts);
    const undated = items.filter((i) => i.ts === null);
    return { dated, undated, total: items.length };
  }, [byCategory]);

  const datedCount = (byCategory.date?.length || 0) + (byCategory.event?.length || 0);
  const showTimelineTab = timelineItems.total >= 3;
  const showClustersTab = clusters.length >= 2;

  // Auto-pick the default view from the shape of the results. Dashboard is the
  // safe default; only strongly date/event-heavy results open on the timeline,
  // and only overwhelmingly concept-only results open on clusters.
  const autoView = useMemo(() => {
    const total = entities.length || 1;
    if (showTimelineTab && datedCount >= 5 && datedCount >= 0.4 * total) return 'timeline';
    const conceptCount =
      (byCategory.technology?.length || 0) + (byCategory.software?.length || 0);
    const nonConcept =
      (byCategory.person?.length || 0) +
      (byCategory.company?.length || 0) +
      (byCategory.alarm?.length || 0) +
      (byCategory.place?.length || 0);
    if (showClustersTab && total >= 12 && conceptCount >= 0.8 * total && nonConcept <= 2) {
      return 'clusters';
    }
    return 'dashboard';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const [view, setView] = useState(autoView);
  const [selectedKey, setSelectedKey] = useState(null);
  const [explorerKey, setExplorerKey] = useState(null);
  const [showAllEvidence, setShowAllEvidence] = useState(false);

  useEffect(() => {
    setView(autoView);
    setSelectedKey(null);
    setExplorerKey(null);
    setShowAllEvidence(false);
  }, [graph, autoView]);

  useEffect(() => {
    if (!selectedKey || view !== 'dashboard') return;
    const el = document.getElementById(entityDomId(selectedKey));
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedKey, view]);

  const selectEntity = (key) => {
    setView('dashboard');
    setExplorerKey(null);
    setSelectedKey((prev) => (prev === key ? null : key));
  };

  const exploreEntity = (key) => {
    setExplorerKey(key);
    setView('explorer');
  };

  const isSparse =
    graph.meta.entityCount + (graph.meta.eventCount || 0) < MIN_ENTITIES_FOR_DASHBOARD;

  if (isSparse) {
    return (
      <div className="graph-sparse-fallback">
        <p className="muted">
          Not enough people, technologies, or other structured details turned up in these
          results to build an insights dashboard — showing your library results instead.
        </p>
        <LocalResultsList local={local} onOpenDocument={onOpenDocument} onOpenTicket={onOpenTicket} />
      </div>
    );
  }

  const summarySentences = buildSummary(graph, byCategory, entities);

  const sourceButton = (type, id, title, key) => (
    <button
      key={key}
      className="graph-citation-source"
      onClick={() => (type === 'document' ? onOpenDocument(id) : onOpenTicket(id))}
    >
      {type === 'document' ? '📄' : '🎫'} {title}
    </button>
  );

  const renderEntityDetail = (entity) => {
    const related = (adjacency.get(entity.key) || [])
      .filter((r) => r.key !== '__query__')
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
      .map((r) => ({ ...r, node: nodeByKey.get(r.key) }))
      .filter((r) => r.node);
    const maxWeight = related.reduce((m, r) => Math.max(m, r.weight), 1);

    return (
      <div className="dash-entity-detail">
        {entity.sources?.length > 0 && (
          <div className="dash-detail-block">
            <h5>Appears in</h5>
            <div className="dash-source-row">
              {entity.sources.map((s, i) => sourceButton(s.type, s.id, s.title, `s-${i}`))}
            </div>
          </div>
        )}

        {related.length > 0 && (
          <div className="dash-detail-block">
            <h5>Related entities</h5>
            <ul className="dash-bar-list">
              {related.map((r) => (
                <li key={r.key}>
                  <button className="dash-bar-row" onClick={() => selectEntity(r.key)}>
                    <span className="dash-bar-label">
                      <span
                        className="graph-legend-dot"
                        style={{ background: CATEGORY_COLORS[r.node.category] || '#ccc' }}
                      />
                      {r.node.text}
                    </span>
                    <span className="dash-bar-track">
                      <span
                        className="dash-bar-fill"
                        style={{
                          width: `${Math.max(8, Math.round((r.weight / maxWeight) * 100))}%`,
                          background: CATEGORY_COLORS[r.node.category] || '#8a8078',
                        }}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="dash-explore-btn" onClick={() => exploreEntity(entity.key)}>
              Show connections →
            </button>
          </div>
        )}

        {entity.sources?.some((s) => s.excerpts?.length) && (
          <div className="dash-detail-block">
            <h5>Supporting excerpts</h5>
            <ul className="graph-citation-list">
              {entity.sources.map((s, i) =>
                (s.excerpts || []).map((ex, j) => (
                  <li key={`${i}-${j}`}>
                    <div className="graph-citation-excerpt">"{ex}"</div>
                    {sourceButton(s.type, s.id, s.title, `ex-${i}-${j}`)}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderEntityRow = (entity) => (
    <li key={entity.key} id={entityDomId(entity.key)}>
      <button
        className={`dash-entity-row ${selectedKey === entity.key ? 'active' : ''}`}
        onClick={() => setSelectedKey(selectedKey === entity.key ? null : entity.key)}
      >
        <span
          className="graph-legend-dot"
          style={{ background: CATEGORY_COLORS[entity.category] || '#ccc' }}
        />
        <span className="dash-entity-name">{entity.text}</span>
        <span className="dash-entity-count">×{entity.count}</span>
      </button>
      {selectedKey === entity.key && renderEntityDetail(entity)}
    </li>
  );

  const conceptSelected = selectedKey?.startsWith('concept:') ? selectedKey.slice(8) : null;
  const conceptExcerpts = conceptSelected
    ? evidence.filter((e) => e.excerpt.toLowerCase().includes(conceptSelected.toLowerCase()))
    : [];

  const visibleEvidence = showAllEvidence ? evidence : evidence.slice(0, 8);

  return (
    <div className="dash-shell">
      <div className="dash-view-tabs">
        <button
          className={`dash-view-tab ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView('dashboard')}
        >
          Dashboard
        </button>
        {showTimelineTab && (
          <button
            className={`dash-view-tab ${view === 'timeline' ? 'active' : ''}`}
            onClick={() => setView('timeline')}
          >
            Timeline
          </button>
        )}
        {showClustersTab && (
          <button
            className={`dash-view-tab ${view === 'clusters' ? 'active' : ''}`}
            onClick={() => setView('clusters')}
          >
            Concept Clusters
          </button>
        )}
        {view === 'explorer' && <button className="dash-view-tab active">Entity Explorer</button>}
      </div>

      {view === 'explorer' && explorerKey && (
        <div className="dash-explorer">
          <div className="dash-explorer-header">
            <button className="btn" onClick={() => setView('dashboard')}>
              ← Back to dashboard
            </button>
            <span className="muted">
              Connections for "{nodeByKey.get(explorerKey)?.text}" — direct neighbors only.
            </span>
          </div>
          <KnowledgeGraph
            graph={buildScopedGraph(graph, explorerKey)}
            local={local}
            onOpenDocument={onOpenDocument}
            onOpenTicket={onOpenTicket}
          />
        </div>
      )}

      {view === 'dashboard' && (
        <>
          <section className="dash-summary">
            <h3>Executive summary</h3>
            <p>{summarySentences.join(' ')}</p>
          </section>

          <div className="dash-grid">
            {SECTIONS.map(({ category, title }) => {
              const list = byCategory[category];
              if (!list?.length) return null;
              return (
                <section className="dash-card" key={category}>
                  <h4
                    className="dash-card-title"
                    style={{ '--card-color': CATEGORY_COLORS[category] || '#ccc' }}
                  >
                    {title} <span className="dash-card-count">{list.length}</span>
                  </h4>
                  <ul className="dash-entity-list">{list.map(renderEntityRow)}</ul>
                </section>
              );
            })}

            {graph.keywords?.length > 0 && (
              <section className="dash-card" key="concepts">
                <h4 className="dash-card-title" style={{ '--card-color': CATEGORY_COLORS.concept }}>
                  Concepts <span className="dash-card-count">{graph.keywords.length}</span>
                </h4>
                <ul className="dash-entity-list">
                  {graph.keywords.map((kw) => (
                    <li key={kw.phrase} id={entityDomId(`concept:${kw.phrase}`)}>
                      <button
                        className={`dash-entity-row ${conceptSelected === kw.phrase ? 'active' : ''}`}
                        onClick={() =>
                          setSelectedKey(
                            conceptSelected === kw.phrase ? null : `concept:${kw.phrase}`
                          )
                        }
                      >
                        <span
                          className="graph-legend-dot"
                          style={{ background: CATEGORY_COLORS.concept }}
                        />
                        <span className="dash-entity-name">{kw.phrase}</span>
                        <span className="dash-entity-count">{kw.score}</span>
                      </button>
                      {conceptSelected === kw.phrase && (
                        <div className="dash-entity-detail">
                          {conceptExcerpts.length ? (
                            <div className="dash-detail-block">
                              <h5>Mentioned in</h5>
                              <ul className="graph-citation-list">
                                {conceptExcerpts.slice(0, 4).map((e, i) => (
                                  <li key={i}>
                                    <div className="graph-citation-excerpt">"{e.excerpt}"</div>
                                    {sourceButton(e.sourceType, e.sourceId, e.sourceTitle, `c-${i}`)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="muted dash-detail-block">
                              A high-ranking keyword phrase from the matched text (no single
                              excerpt to pin it to).
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <section className="dash-evidence">
            <h3>Supporting evidence</h3>
            <ul className="graph-citation-list">
              {visibleEvidence.map((e, i) => (
                <li key={i}>
                  <div className="graph-citation-excerpt">"{e.excerpt}"</div>
                  {sourceButton(e.sourceType, e.sourceId, e.sourceTitle, `ev-${i}`)}
                </li>
              ))}
            </ul>
            {evidence.length > 8 && (
              <button className="btn" onClick={() => setShowAllEvidence((v) => !v)}>
                {showAllEvidence ? 'Show fewer' : `Show all ${evidence.length} excerpts`}
              </button>
            )}
          </section>
        </>
      )}

      {view === 'timeline' && (
        <div className="dash-timeline">
          {timelineItems.dated.map((item) => (
            <div className="dash-timeline-item" key={item.key}>
              <div className="dash-timeline-date">
                {new Date(item.ts).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
              <div className="dash-timeline-body">
                <div className="graph-citation-excerpt">"{item.excerpt || item.label}"</div>
                <div className="dash-source-row">
                  {item.sources.map((s, i) => sourceButton(s.type, s.id, s.title, `t-${i}`))}
                </div>
              </div>
            </div>
          ))}

          {timelineItems.undated.length > 0 && (
            <>
              <h4 className="dash-timeline-undated-title">Undated / relative mentions</h4>
              {timelineItems.undated.map((item) => (
                <div className="dash-timeline-item undated" key={item.key}>
                  <div className="dash-timeline-date">{truncateLabel(item.label)}</div>
                  <div className="dash-timeline-body">
                    <div className="graph-citation-excerpt">"{item.excerpt || item.label}"</div>
                    <div className="dash-source-row">
                      {item.sources.map((s, i) => sourceButton(s.type, s.id, s.title, `u-${i}`))}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {timelineItems.total === 0 && (
            <p className="muted">No dated items found in these results.</p>
          )}
        </div>
      )}

      {view === 'clusters' && (
        <div className="dash-clusters">
          {clusters.map((cluster) => (
            <section className="dash-cluster-tile" key={cluster.name}>
              <h4>{cluster.name}</h4>
              <div className="dash-cluster-chips">
                {cluster.members.map((m) => (
                  <button
                    key={m.key}
                    className="dash-cluster-chip"
                    style={{ '--chip-color': CATEGORY_COLORS[m.category] || '#ccc' }}
                    onClick={() => selectEntity(m.key)}
                  >
                    <span
                      className="graph-legend-dot"
                      style={{ background: CATEGORY_COLORS[m.category] || '#ccc' }}
                    />
                    {m.text}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function truncateLabel(text) {
  return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}

// Templated executive summary assembled locally from the extraction output — no
// LLM involved, so it's fast, free, and only as good as the extraction itself.
function buildSummary(graph, byCategory, entities) {
  const s = [];
  const m = graph.meta;
  s.push(
    `Across ${m.matchedSources} matching source${m.matchedSources === 1 ? '' : 's'}, this search ` +
      `surfaced ${m.entityCount} distinct entit${m.entityCount === 1 ? 'y' : 'ies'} and ` +
      `${m.relationshipCount} relationship${m.relationshipCount === 1 ? '' : 's'}.`
  );

  const mention = (category, label) => {
    const list = byCategory[category];
    if (!list?.length) return;
    const names = list.slice(0, 3).map((e) => e.text).join(', ');
    s.push(`${label}: ${names}.`);
  };
  mention('technology', 'Key technologies');
  mention('software', 'Software involved');
  mention('alarm', 'Recurring faults/issues');
  mention('part', 'Machine parts mentioned');
  mention('person', 'People');
  mention('company', 'Organizations');

  let strongest = null;
  for (const e of graph.edges) {
    if (e.kind === 'relevance') continue;
    if (!strongest || e.weight > strongest.weight) strongest = e;
  }
  if (strongest && strongest.weight > 1) {
    const a = entities.find((n) => n.key === strongest.a);
    const b = entities.find((n) => n.key === strongest.b);
    if (a && b) {
      s.push(
        `"${a.text}" and "${b.text}" appear together most often ` +
          `(${strongest.weight} shared paragraph${strongest.weight === 1 ? '' : 's'}).`
      );
    }
  }
  return s;
}
