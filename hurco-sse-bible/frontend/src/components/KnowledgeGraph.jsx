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

export default function KnowledgeGraph({ graph, local, onOpenDocument, onOpenTicket }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const persistentNodesRef = useRef(new Map());
  const simulationRef = useRef(null);

  const [revealed, setRevealed] = useState(
    () => new Set(graph.nodes.filter((n) => n.initial).map((n) => n.key))
  );
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    setRevealed(new Set(graph.nodes.filter((n) => n.initial).map((n) => n.key)));
    setSelectedEdge(null);
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

  const expandNode = (key) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      for (const e of graph.edges) {
        if (e.a === key) next.add(e.b);
        if (e.b === key) next.add(e.a);
      }
      return next;
    });
  };

  const isSparse = graph.meta.entityCount + (graph.meta.eventCount || 0) < MIN_ENTITIES_FOR_GRAPH;

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
    svg.attr('viewBox', [0, 0, width, height]).on('click', () => setSelectedEdge(null));

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
        if (d.citations?.length) setSelectedEdge(d);
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
        expandNode(d.key);
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
    return () => simulation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, visibleEdges, isSparse]);

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

      {hasHiddenNeighbors.size > 0 && (
        <p className="graph-hint muted">
          Dashed gold outline = more connections to reveal. Click a node to expand it, drag to
          rearrange, click an edge for supporting excerpts.
        </p>
      )}

      {graph.meta.truncated && (
        <p className="graph-hint muted">
          Showing the {graph.nodes.length - 1} most important of {graph.meta.totalBeforeTruncation}{' '}
          entities found — narrow your search for a more focused graph.
        </p>
      )}

      {tooltip && (
        <div
          className="graph-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <div className="graph-tooltip-title">{tooltip.node.text}</div>
          <div className="graph-tooltip-category">{CATEGORY_LABELS[tooltip.node.category] || tooltip.node.category}</div>
          {!tooltip.node.isCentral && (
            <div className="graph-tooltip-score">Mentions: {tooltip.node.count} · Weight: {Math.round(tooltip.node.importance * 10) / 10}</div>
          )}
          {tooltip.node.sources?.length > 0 && (
            <div className="graph-tooltip-sources">
              Source{tooltip.node.sources.length > 1 ? 's' : ''}:{' '}
              {tooltip.node.sources.slice(0, 3).map((s) => s.title).join(', ')}
            </div>
          )}
        </div>
      )}

      {selectedEdge && (
        <div className="graph-citation-panel">
          <div className="graph-citation-header">
            <span>Supporting excerpts</span>
            <button className="graph-citation-close" onClick={() => setSelectedEdge(null)}>✕</button>
          </div>
          <ul className="graph-citation-list">
            {selectedEdge.citations.map((c, i) => (
              <li key={i}>
                <div className="graph-citation-excerpt">"{c.excerpt}"</div>
                <button
                  className="graph-citation-source"
                  onClick={() =>
                    c.sourceType === 'document' ? onOpenDocument(c.sourceId) : onOpenTicket(c.sourceId)
                  }
                >
                  {c.sourceType === 'document' ? '📄' : '🎫'} {c.sourceTitle}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
