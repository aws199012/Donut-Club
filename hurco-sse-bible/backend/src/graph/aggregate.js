// Merges the precomputed per-document/per-ticket graph_data for a matched search
// into one graph: entities become nodes (counts/importance summed across sources),
// paragraph co-occurrences become edges (counts summed, excerpts kept as
// citations), and a central node for the query itself connects out to the
// most important entities. No extraction happens here — this only combines
// numbers and text that extract.js already computed at write time.
const NODE_KEY_QUERY = '__query__';
const MAX_NODES = 70;
const MAX_CENTRAL_LINKS = 12;

function ensureEntityNode(nodeMap, key, text, category) {
  if (!nodeMap.has(key)) {
    nodeMap.set(key, { key, text, category, count: 0, importance: 0, sources: new Map() });
  }
  return nodeMap.get(key);
}

function addSourceRef(node, source, excerpts) {
  const sourceKey = `${source.type}:${source.id}`;
  if (!node.sources.has(sourceKey)) {
    node.sources.set(sourceKey, { type: source.type, id: source.id, title: source.title, excerpts: [] });
  }
  const ref = node.sources.get(sourceKey);
  for (const ex of excerpts) {
    if (ref.excerpts.length < 3 && !ref.excerpts.includes(ex)) ref.excerpts.push(ex);
  }
}

export function aggregateGraph(query, sources) {
  const nodeMap = new Map();
  const edgeMap = new Map();

  for (const source of sources) {
    const sourceKey = `${source.type}:${source.id}`;
    const graphData = source.graphData || {};
    const entities = graphData.entities || [];
    const relationships = graphData.relationships || [];
    const events = graphData.events || [];

    for (const entity of entities) {
      const node = ensureEntityNode(nodeMap, entity.key, entity.text, entity.category);
      node.count += entity.count;
      node.importance += entity.importance ?? entity.count;
      addSourceRef(node, source, entity.excerpts || []);
    }

    for (const rel of relationships) {
      const edgeKey = [rel.a, rel.b].sort().join('~~');
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, { a: rel.a, b: rel.b, weight: 0, kind: 'cooccurrence', citations: [] });
      }
      const edge = edgeMap.get(edgeKey);
      edge.weight += rel.count;
      for (const ex of rel.excerpts || []) {
        if (edge.citations.length < 12) {
          edge.citations.push({ sourceType: source.type, sourceId: source.id, sourceTitle: source.title, excerpt: ex });
        }
      }
    }

    for (const event of events) {
      const eventKey = `${sourceKey}:${event.key}`;
      const label = event.text.length > 140 ? `${event.text.slice(0, 137)}...` : event.text;
      nodeMap.set(eventKey, {
        key: eventKey,
        text: label,
        category: 'event',
        count: 1,
        importance: 1,
        sources: new Map([
          [sourceKey, { type: source.type, id: source.id, title: source.title, excerpts: [event.text] }],
        ]),
      });

      for (const relatedKey of event.relatedEntityKeys || []) {
        if (!nodeMap.has(relatedKey)) continue;
        const edgeKey = [eventKey, relatedKey].sort().join('~~');
        if (!edgeMap.has(edgeKey)) {
          edgeMap.set(edgeKey, { a: eventKey, b: relatedKey, weight: 0, kind: 'event', citations: [] });
        }
        const edge = edgeMap.get(edgeKey);
        edge.weight += 1;
        if (edge.citations.length < 12) {
          edge.citations.push({ sourceType: source.type, sourceId: source.id, sourceTitle: source.title, excerpt: event.text });
        }
      }
    }
  }

  // Cap to the most important nodes so a broad query doesn't produce an unreadable
  // blob; the frontend additionally starts with only the central node's direct
  // links visible and reveals the rest via click (progressive disclosure).
  const allNodes = [...nodeMap.values()].sort((a, b) => b.importance - a.importance);
  const truncated = allNodes.length > MAX_NODES;
  const keptNodes = allNodes.slice(0, MAX_NODES);
  const keptKeys = new Set(keptNodes.map((n) => n.key));
  const keptEdges = [...edgeMap.values()].filter((e) => keptKeys.has(e.a) && keptKeys.has(e.b));

  const centralTargets = keptNodes.slice(0, Math.min(MAX_CENTRAL_LINKS, keptNodes.length));
  const centralTargetKeys = new Set(centralTargets.map((n) => n.key));
  const maxImportance = keptNodes.reduce((max, n) => Math.max(max, n.importance), 1);

  const nodes = [
    {
      key: NODE_KEY_QUERY,
      text: query,
      category: 'query',
      count: 0,
      importance: maxImportance * 2,
      sources: [],
      isCentral: true,
      initial: true,
    },
    ...keptNodes.map((n) => ({
      key: n.key,
      text: n.text,
      category: n.category,
      count: n.count,
      importance: n.importance,
      sources: [...n.sources.values()],
      isCentral: false,
      initial: centralTargetKeys.has(n.key),
    })),
  ];

  const edges = [
    ...centralTargets.map((n) => ({
      a: NODE_KEY_QUERY,
      b: n.key,
      weight: n.importance,
      kind: 'relevance',
      citations: [],
    })),
    ...keptEdges,
  ];

  return {
    query,
    nodes,
    edges,
    meta: {
      matchedSources: sources.length,
      entityCount: keptNodes.filter((n) => n.category !== 'event').length,
      eventCount: keptNodes.filter((n) => n.category === 'event').length,
      relationshipCount: keptEdges.length,
      truncated,
      totalBeforeTruncation: allNodes.length,
    },
  };
}
