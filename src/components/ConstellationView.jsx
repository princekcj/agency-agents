import React, { useEffect, useRef, useCallback } from 'react';

let ForceGraph3DModule = null;

export default function ConstellationView({ agents, onSelectAgent }) {
  const wrapRef      = useRef(null); // outer wrapper — sized by CSS
  const containerRef = useRef(null); // inner div — graph is injected here
  const graphRef     = useRef(null);
  const cleanupRef   = useRef(null);

  const buildGraphData = useCallback(() => {
    const nodes = agents.map(a => ({
      id: a.name,
      name: a.name,
      division: a.division || 'Unknown',
      color: a.divisionColor || '#dc2626',
      agent: a,
    }));

    const byDivision = {};
    agents.forEach(a => {
      const d = a.division || 'Unknown';
      if (!byDivision[d]) byDivision[d] = [];
      byDivision[d].push(a.name);
    });

    const links = [];
    Object.values(byDivision).forEach(names => {
      for (let i = 0; i < names.length - 1; i++) {
        links.push({ source: names[i], target: names[i + 1] });
      }
    });

    return { nodes, links };
  }, [agents]);

  useEffect(() => {
    if (!wrapRef.current || !containerRef.current || agents.length === 0) return;

    let cancelled = false;

    async function init() {
      try {
        if (!ForceGraph3DModule) {
          ForceGraph3DModule = (await import('3d-force-graph')).default;
        }
        if (cancelled) return;

        // Use the wrapper's dimensions — it's always sized by CSS
        const { width, height } = wrapRef.current.getBoundingClientRect();
        const isMobile = width < 640;
        const graphData = buildGraphData();

        const graph = ForceGraph3DModule()(containerRef.current)
          .width(width)
          .height(height)
          .backgroundColor('#080000')
          .graphData(graphData)
          .nodeLabel(n =>
            `<div style="font-family:monospace;font-size:11px;background:rgba(0,0,0,0.88);` +
            `border:1px solid ${n.color};color:${n.color};padding:4px 8px;border-radius:3px;` +
            `max-width:200px;word-break:break-word;">` +
            `${n.name}<br/><span style="color:#888;font-size:9px;">${n.division}</span></div>`
          )
          .nodeColor(n => n.color)
          .nodeOpacity(0.92)
          .nodeResolution(isMobile ? 8 : 12)
          .nodeVal(() => isMobile ? 1.8 : 2.5)
          .linkColor(() => 'rgba(220,38,38,0.15)')
          .linkWidth(0.4)
          .linkOpacity(0.4)
          .onNodeClick(n => { if (onSelectAgent) onSelectAgent(n.agent); })
          .onNodeHover(n => {
            if (containerRef.current) {
              containerRef.current.style.cursor = n ? 'pointer' : 'default';
            }
          });

        // Center the camera and set initial distance
        const dist = isMobile ? 280 : 400;
        graph.cameraPosition({ x: 0, y: 0, z: dist });

        // Slow auto-rotation
        let angle = 0;
        const rotateInterval = setInterval(() => {
          if (!graphRef.current) return;
          angle += 0.002;
          graph.cameraPosition({
            x: dist * Math.sin(angle),
            z: dist * Math.cos(angle),
          });
        }, 33);

        graphRef.current = graph;
        cleanupRef.current = () => {
          clearInterval(rotateInterval);
          try { graph._destructor && graph._destructor(); } catch {}
          if (containerRef.current) containerRef.current.innerHTML = '';
          graphRef.current = null;
        };
      } catch (err) {
        console.error('ConstellationView init error:', err);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [agents, buildGraphData, onSelectAgent]);

  // ResizeObserver — tracks the wrapper and resizes graph to match
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (graphRef.current && width > 0 && height > 0) {
        graphRef.current.width(width).height(height);
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="constellation-wrap">
      {/* Overlay header — centred via CSS, pointer-events none */}
      <div className="constellation-header">
        <span className="constellation-title">AGENT CONSTELLATION</span>
        <span className="constellation-sub">
          {agents.length} agents · tap/click any node to inspect
        </span>
      </div>

      {/* Graph injection target — fills wrapper absolutely */}
      <div ref={containerRef} className="constellation-canvas" />
    </div>
  );
}
