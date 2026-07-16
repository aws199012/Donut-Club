import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import LocalResultsList from './LocalResultsList.jsx';

// Entity-category palette — deliberately separate from the sidebar's flat
// red/blue/green pixel-button theme (jewel/pastel tones so they read as data,
// not as more UI chrome). "query" is the central search-term node.
const CATEGORY_COLORS = {
  query: '#f1efec',
  person: '#f6ad55',
  company: '#ecc94b',
  place: '#9f7aea',
  date: '#a0aec0',
  technology: '#4fd1c5',
  part: '#ed64a6',
  alarm: '#fc8181',
  software: '#7c86e8',
  event: '#68d391',
};

const CATEGORY_LABELS = {
  person: 'People',
  company: 'Companies',
  place: 'Locations',
  date: 'Dates',
  technology: 'Technologies',
  part: 'Parts',
  alarm: 'Alarms',
  software: 'Software',
  event: 'Events',
};

const CATEGORY_SINGULAR = {
  query: 'Search term',
  person: 'Person',
  company: 'Company',
  place: 'Location',
  date: 'Date',
  technology: 'Technology',
  part: 'Machine part',
  alarm: 'Alarm / fault',
  software: 'Software',
  event: 'Event',
};

const MIN_ENTITIES_FOR_GRAPH = 3;

function nodeRadius(node) {
  if (node.isCentral) return 36;
  return Math.min(10 + Math.sqrt(Math.max(node.importance, 1)) * 6, 40);
}

function edgeWidth(edge) {
  return Math.min(1 + Math.sqrt(Math.max(edge.weight, 1)) * 1.3, 9);
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function edgeTouches(edge, key) {
  return edge.a === key || edge.b === key;
}

function sameEdge(e1, e2) {
  return (e1.a === e2.a && e1.b === e2.b) || (e1.a === e2.b && e1.b === e2.a);
}

export default function KnowledgeGraph({ graph, local, onOpenDocument, onOpenTicket }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const persistentNodesRef = useRef(new Map());
  const simulationRef = useRef(null);
  const nodeSelRef = useRef(null);
  const linkSelRef = useRef(null);
  const applyHighlightRef = useRef(() => {});

  const [revealed, setRevealed] = useState(
    () => new Set(graph.nodes.filter((n) => n.initial).map((n) => n.key))
  );
  // selected: { type: 'node', key } | { type: 'edge', a, b, weight, citations } | null
  const [selected, setSelected] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const nodeByKey = useMemo(() => new Map(graph.nodes.map((n) => [n.key, n])), [graph]);

  useEffect(() => {
    setRevealed(new Set(graph.nodes.filter((n) => n.initial).map((n) => n.key)));
    setSelected(null);
    setTooltip(null);
    persistentNodesRef.current = new Map();
  }, [graph]);

  const visibleNodes = useMemo(
    () => graph.nodes.filter((n) => revealed.has(n.key)),
    [graph, revealed]
  );
  const visibleEdges = useMemo(
    () => graph.edges.filter((e) => revealed.has(e.a) && revealed.has(e.b)),
    [graph, revealed]
  );
  const hasHiddenNeighbors = useMemo(() => {
    const keys = new Set();
    for (const e of graph.edges) {
      if (revealed.has(e.a) && !revealed.has(e.b)) keys.add(e.a);
      if (revealed.has(e.b) && !revealed.has(e.a)) keys.add(e.b);
    }
    return keys;
  }, [graph, revealed]);

  // Selecting a node opens its detail panel AND reveals its hidden neighbors
  // (progressive disclosure), so the panel's "connected entities" list matches
  // what appears in the graph.
  const selectNode = (key) => {
    setSelected({ type: 'node', key });
    setTooltip(null);
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(key);
      for (const e of graph.edges) {
        if (e.a === key) next.add(e.b);
        if (e.b === key) next.add(e.a);
      }
      return next;
    });
  };

  const selectedNode = selected?.type === 'node' ? nodeByKey.get(selected.key) : null;

  const neighborRows = useMemo(() => {
    if (!selectedNode) return [];
    const rows = [];
    for (const e of graph.edges) {
      let otherKey = null;
      if (e.a === selectedNode.key) otherKey = e.b;
      else if (e.b === selectedNode.key) otherKey = e.a;
      if (!otherKey || otherKey === '__query__') continue;
      const node = nodeByKey.get(otherKey);
      if (node) rows.push({ node, weight: e.weight, kind: e.kind });
    }
    rows.sort((x, y) => y.weight - x.weight);
    return rows;
  }, [selectedNode, graph, nodeByKey]);

  const isSparse = graph.meta.entityCount + (graph.meta.eventCount || 0) < MIN_ENTITIES_FOR_GRAPH;

  // Reassigned every render so it always sees the current selection/reveal state;
  // both the build effect and the selection effect call through this ref.
  applyHighlightRef.current = () => {
    const nodeSel = nodeSelRef.current;
    const linkSel = linkSelRef.current;
    if (!nodeSel || !linkSel) return;

    const baseCircleStroke = (d) =>
      d.isCentral ? '#cf2323' : hasHiddenNeighbors.has(d.key) ? '#f2b705' : '#0b0a0a';
    const baseCircleStrokeWidth = (d) => (d.isCentral ? 4 : hasHiddenNeighbors.has(d.key) ? 3 : 1.5);
    const baseLinkStroke = (d) => (d.kind === 'relevance' ? '#6b6058' : '#8a8078');

    if (!selected) {
      nodeSel.attr('opacity', 1);
      nodeSel
        .select('circle')
        .attr('stroke', baseCircleStroke)
        .attr('stroke-width', baseCircleStrokeWidth);
      linkSel.attr('stroke', baseLinkStroke).attr('stroke-opacity', 0.55);
      return;
    }

    if (selected.type === 'node') {
      const focus = new Set([selected.key]);
      for (const e of graph.edges) {
        if (e.a === selected.key) focus.add(e.b);
        if (e.b === selected.key) focus.add(e.a);
      }
      nodeSel.attr('opacity', (d) => (focus.has(d.key) ? 1 : 0.18));
      nodeSel
        .select('circle')
        .attr('stroke', (d) => (d.key === selected.key ? '#ffffff' : baseCircleStroke(d)))
        .attr('stroke-width', (d) => (d.key === selected.key ? 4.5 : baseCircleStrokeWidth(d)));
      linkSel
        .attr('stroke', (d) => (edgeTouches(d, selected.key) ? '#e05252' : baseLinkStroke(d)))
        .attr('stroke-opacity', (d) => (edgeTouches(d, selected.key) ? 0.95 : 0.1));
    } else {
      // edge selection: spotlight the two endpoints and that single edge
      nodeSel.attr('opacity', (d) => (d.key === selected.a || d.key === selected.b ? 1 : 0.18));
      nodeSel
        .select('circle')
        .attr('stroke', (d) =>
          d.key === selected.a || d.key === selected.b ? '#ffffff' : baseCircleStroke(d)
        )
        .attr('stroke-width', (d) =>
          d.key === selected.a || d.key === selected.b ? 4 : baseCircleStrokeWidth(d)
        );
      linkSel
        .attr('stroke', (d) => (sameEdge(d, selected) ? '#e05252' : baseLinkStroke(d)))
        .attr('stroke-opacity', (d) => (sameEdge(d, selected) ? 1 : 0.1));
    }
  };

  useEffect(() => {
    if (isSparse || !svgRef.current) return undefined;

    const width = containerRef.current?.clientWidth || 800;
    const height = 520;

    const persistent = persistentNodesRef.current;
    const simNodes = visibleNodes.map((n) => {
      let obj = persistent.get(n.key);
      if (!obj) {
        obj = {
          ...n,
          x: width / 2 + (Math.random() - 0.5) * 60,
          y: height / 2 + (Math.random() - 0.5) * 60,
        };
        persistent.set(n.key, obj);
      } else {
        Object.assign(obj, n);
      }
      return obj;
    });
    const simNodeByKey = new Map(simNodes.map((n) => [n.key, n]));
    const simLinks = visibleEdges
      .map((e) => ({ ...e, source: simNodeByKey.get(e.a), target: simNodeByKey.get(e.b) }))
      .filter((l) => l.source && l.target);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    // Clicking empty space (not a node/edge — those stopPropagation) closes the panel.
    svg.attr('viewBox', [0, 0, width, height]).on('click', () => setSelected(null));

    const g = svg.append('g');
    svg.call(
      d3.zoom().scaleExtent([0.3, 3]).on('zoom', (event) => g.attr('transform', event.transform))
    );

    const linkSel = g
      .append('g')
      .attr('stroke-opacity', 0.55)
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d) => (d.kind === 'relevance' ? '#6b6058' : '#8a8078'))
      .attr('stroke-width', edgeWidth)
      .style('cursor', (d) => (d.citations?.length ? 'pointer' : 'default'))
      .on('click', (event, d) => {
        event.stopPropagation();
        if (d.citations?.length) {
          setSelected({ type: 'edge', a: d.a, b: d.b, weight: d.weight, citations: d.citations });
          setTooltip(null);
        }
      });

    const nodeGroup = g
      .append('g')
      .selectAll('g')
      .data(simNodes, (d) => d.key)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          // Without this, any sub-pixel mouse jitter during a click turns it into a
          // zero-length drag and the click never fires. Within 6px it's a click.
          .clickDistance(6)
          .on('start', (event, d) => {
            if (!event.active) simulationRef.current.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulationRef.current.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        selectNode(d.key);
      })
      .on('mouseenter', (event, d) => {
        const rect = containerRef.current.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: d });
      })
      .on('mousemove', (event) => {
        const rect = containerRef.current.getBoundingClientRect();
        setTooltip((t) => (t ? { ...t, x: event.clientX - rect.left, y: event.clientY - rect.top } : t));
      })
      .on('mouseleave', () => setTooltip(null));

    nodeGroup
      .append('circle')
      .attr('r', nodeRadius)
      .attr('fill', (d) => CATEGORY_COLORS[d.category] || '#ccc')
      .attr('stroke', (d) => (d.isCentral ? '#cf2323' : hasHiddenNeighbors.has(d.key) ? '#f2b705' : '#0b0a0a'))
      .attr('stroke-width', (d) => (d.isCentral ? 4 : hasHiddenNeighbors.has(d.key) ? 3 : 1.5))
      .attr('stroke-dasharray', (d) => (!d.isCentral && hasHiddenNeighbors.has(d.key) ? '3,2' : null));

    nodeGroup
      .append('text')
      .text((d) => truncate(d.text, 20))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => nodeRadius(d) + 14)
      .attr('fill', '#f1efec')
      .attr('font-size', 11)
      .attr('font-family', "'Nunito', sans-serif")
      .style('pointer-events', 'none');

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink(simLinks)
          .id((d) => d.key)
          .distance((l) => (l.kind === 'relevance' ? 130 : 80))
          .strength(0.4)
      )
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collide',
        d3.forceCollide().radius((d) => nodeRadius(d) + 20)
      )
      .on('tick', () => {
        linkSel
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y);
        nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`);
      });

    simulationRef.current = simulation;
    nodeSelRef.current = nodeGroup;
    linkSelRef.current = linkSel;
    applyHighlightRef.current();

    return () => simulation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, visibleEdges, isSparse]);

  // Re-apply spotlight styling whenever the selection (or the set of nodes with
  // hidden neighbors) changes, without rebuilding the whole simulation.
  useEffect(() => {
    applyHighlightRef.current();
  }, [selected, hasHiddenNeighbors]);

  if (isSparse) {
    return (
      <div className="graph-sparse-fallback">
        <p className="muted">
          Not enough people, technologies, or other structured details turned up in these
          results to build a useful knowledge graph — showing your library results instead.
        </p>
        <LocalResultsList local={local} onOpenDocument={onOpenDocument} onOpenTicket={onOpenTicket} />
      </div>
    );
  }

  const renderSourceButton = (type, id, title, key) => (
    <button
      key={key}
      className="graph-citation-source"
      onClick={() => (type === 'document' ? onOpenDocument(id) : onOpenTicket(id))}
    >
      {type === 'document' ? '📄' : '🎫'} {title}
    </button>
  );

  const nodeSummary = (node) => {
    if (node.isCentral) {
      return 'Your search term — linked to the most relevant entities found across the matching documents and tickets.';
    }
    if (node.category === 'event') {
      return 'A dated action detected in the text (a sentence containing both a date and an action like replaced, failed, installed…).';
    }
    const kind = (CATEGORY_SINGULAR[node.category] || node.category).toLowerCase();
    const srcCount = node.sources?.length || 0;
    const top = neighborRows
      .slice(0, 3)
      .map((r) => r.node.text)
      .join(', ');
    return (
      `A ${kind} mentioned ${node.count} time${node.count === 1 ? '' : 's'} across ` +
      `${srcCount} source${srcCount === 1 ? '' : 's'} in these results` +
      (top ? `, most often alongside ${top}.` : '.')
    );
  };

  const selectedEdgeNodes =
    selected?.type === 'edge'
      ? { a: nodeByKey.get(selected.a), b: nodeByKey.get(selected.b) }
      : null;

  return (
    <div className="graph-shell" ref={containerRef}>
      <div className="graph-legend">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <div className="graph-legend-item" key={key}>
            <span className="graph-legend-dot" style={{ background: CATEGORY_COLORS[key] }} />
            {label}
          </div>
        ))}
      </div>

      <svg ref={svgRef} className="graph-svg" />

      <p className="graph-hint muted">
        Click a node for its details and connections · click an edge for the excerpts linking two
        entities · drag to rearrange · click empty space to close the panel.
        {hasHiddenNeighbors.size > 0 && ' Dashed gold outline = more connections to reveal.'}
      </p>

      {graph.meta.truncated && (
        <p className="graph-hint muted">
          Showing the {graph.nodes.length - 1} most important of {graph.meta.totalBeforeTruncation}{' '}
          entities found — narrow your search for a more focused graph.
        </p>
      )}

      {tooltip && !selected && (
        <div className="graph-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <div className="graph-tooltip-title">{tooltip.node.text}</div>
          <div className="graph-tooltip-category">
            {CATEGORY_LABELS[tooltip.node.category] || tooltip.node.category}
          </div>
          {!tooltip.node.isCentral && (
            <div className="graph-tooltip-score">
              Mentions: {tooltip.node.count} · Weight: {Math.round(tooltip.node.importance * 10) / 10}
            </div>
          )}
          <div className="graph-tooltip-sources">Click for details & connections</div>
        </div>
      )}

      {selectedNode && (
        <div className="graph-detail-panel" onClick={(e) => e.stopPropagation()}>
          <div className="graph-detail-header">
            <span
              className="graph-chip"
              style={{ background: CATEGORY_COLORS[selectedNode.category] || '#ccc' }}
            >
              {CATEGORY_SINGULAR[selectedNode.category] || selectedNode.category}
            </span>
            <button className="graph-citation-close" onClick={() => setSelected(null)}>✕</button>
          </div>
          <h3 className="graph-detail-title">{selectedNode.text}</h3>

          {!selectedNode.isCentral && (
            <div className="graph-detail-stats">
              {selectedNode.count} mention{selectedNode.count === 1 ? '' : 's'} ·{' '}
              {selectedNode.sources?.length || 0} source
              {(selectedNode.sources?.length || 0) === 1 ? '' : 's'} · weight{' '}
              {Math.round(selectedNode.importance * 10) / 10}
            </div>
          )}

          <p className="graph-detail-summary">{nodeSummary(selectedNode)}</p>

          {neighborRows.length > 0 && (
            <div className="graph-detail-section">
              <h4>Connected entities</h4>
              <ul className="graph-neighbor-list">
                {neighborRows.map(({ node, weight }) => (
                  <li key={node.key}>
                    <button className="graph-neighbor-btn" onClick={() => selectNode(node.key)}>
                      <span
                        className="graph-legend-dot"
                        style={{ background: CATEGORY_COLORS[node.category] || '#ccc' }}
                      />
                      <span className="graph-neighbor-name">{node.text}</span>
                      <span className="graph-neighbor-weight">×{Math.round(weight * 10) / 10}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedNode.sources?.length > 0 && (
            <div className="graph-detail-section">
              <h4>Supporting excerpts</h4>
              <ul className="graph-citation-list">
                {selectedNode.sources.map((s, i) => (
                  <li key={i}>
                    {(s.excerpts || []).map((ex, j) => (
                      <div className="graph-citation-excerpt" key={j}>"{ex}"</div>
                    ))}
                    {renderSourceButton(s.type, s.id, s.title, `src-${i}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {selected?.type === 'edge' && selectedEdgeNodes && (
        <div className="graph-detail-panel" onClick={(e) => e.stopPropagation()}>
          <div className="graph-detail-header">
            <span className="graph-chip graph-chip-relationship">Relationship</span>
            <button className="graph-citation-close" onClick={() => setSelected(null)}>✕</button>
          </div>
          <h3 className="graph-detail-title">
            <button
              className="graph-detail-endpoint"
              onClick={() => selectNode(selected.a)}
            >
              {selectedEdgeNodes.a?.text || selected.a}
            </button>
            {' ↔ '}
            <button
              className="graph-detail-endpoint"
              onClick={() => selectNode(selected.b)}
            >
              {selectedEdgeNodes.b?.text || selected.b}
            </button>
          </h3>
          <p className="graph-detail-summary">
            These two appear together in {selected.weight} paragraph
            {selected.weight === 1 ? '' : 's'} across the matched results. The excerpts below are
            where the pairing was found.
          </p>
          <div className="graph-detail-section">
            <h4>Supporting excerpts</h4>
            <ul className="graph-citation-list">
              {selected.citations.map((c, i) => (
                <li key={i}>
                  <div className="graph-citation-excerpt">"{c.excerpt}"</div>
                  {renderSourceButton(c.sourceType, c.sourceId, c.sourceTitle, `cit-${i}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
