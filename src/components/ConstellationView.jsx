import React, { useEffect, useRef, useCallback } from 'react';

// Dynamically import 3d-force-graph to avoid SSR issues
let ForceGraph3DModule = null;

export default function ConstellationView({ agents, onSelectAgent }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const cleanupRef = useRef(null);

  const buildGraphData = useCallback(() => {
    const nodes = agents.map(a => ({
      id: a.name,
      name: a.name,
      division: a.division || 'Unknown',
      color: a.divisionColor || '#dc2626',
      agent: a,
    }));

    // Group by division
    const byDivision = {};
    agents.forEach(a => {
      const d = a.division || 'Unknown';
      if (!byDivision[d]) byDivision[d] = [];
      byDivision[d].push(a.name);
    });

    // Create links between agents in the same division (sparse — only connect sequential pairs)
    const links = [];
    Object.values(byDivision).forEach(names => {
      for (let i = 0; i < names.length - 1; i++) {
        links.push({ source: names[i], target: names[i + 1] });
      }
    });

    return { nodes, links };
  }, [agents]);

  useEffect(() => {
    if (!containerRef.current || agents.length === 0) return;

    let cancelled = false;

    async function init() {
      try {
        if (!ForceGraph3DModule) {
          ForceGraph3DModule = (await import('3d-force-graph')).default;
        }
        if (cancelled) return;

        const { width, height } = containerRef.current.getBoundingClientRect();
        const graphData = buildGraphData();

        const graph = ForceGraph3DModule()(containerRef.current)
          .width(width || window.innerWidth)
          .height(height || window.innerHeight - 60)
          .backgroundColor('#080000')
          .graphData(graphData)
          // Nodes
          .nodeLabel(n => `<div style="font-family:monospace;font-size:11px;background:rgba(0,0,0,0.85);border:1px solid ${n.color};color:${n.color};padding:4px 8px;border-radius:3px;">${n.name}<br/><span style="color:#888;font-size:9px;">${n.division}</span></div>`)
          .nodeColor(n => n.color)
          .nodeOpacity(0.92)
          .nodeResolution(12)
          .nodeVal(n => 2.5)
          // Links
          .linkColor(() => 'rgba(220,38,38,0.15)')
          .linkWidth(0.4)
          .linkOpacity(0.4)
          // Click
          .onNodeClick(n => {
            if (onSelectAgent) onSelectAgent(n.agent);
          })
          // Hover
          .onNodeHover(n => {
            containerRef.current.style.cursor = n ? 'pointer' : 'default';
          });

        // Slow auto-rotation
        let angle = 0;
        const rotateInterval = setInterval(() => {
          if (!graphRef.current) return;
          angle += 0.002;
          const dist = 400;
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
        graphRef.current = null;
      }
    };
  }, [agents, buildGraphData, onSelectAgent]);

  // Resize handler
  useEffect(() => {
    const onResize = () => {
      if (graphRef.current && containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        graphRef.current.width(width).height(height);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="constellation-wrap">
      <div className="constellation-header">
        <span className="constellation-title">AGENT CONSTELLATION</span>
        <span className="constellation-sub">{agents.length} agents · click any node to inspect</span>
      </div>
      <div ref={containerRef} className="constellation-canvas" />
    </div>
  );
}
