import { useState, useCallback } from 'react';

// Per-division primary metric labels
export const DIVISION_METRICS = {
  marketing:          { label: 'Campaigns Run',       unit: '' },
  sales:              { label: 'Leads Qualified',      unit: '' },
  engineering:        { label: 'Reviews Done',         unit: '' },
  design:             { label: 'Designs Created',      unit: '' },
  finance:            { label: 'Reports Generated',    unit: '' },
  healthcare:         { label: 'Cases Reviewed',       unit: '' },
  support:            { label: 'Tickets Resolved',     unit: '' },
  security:           { label: 'Audits Run',           unit: '' },
  testing:            { label: 'Tests Executed',       unit: '' },
  product:            { label: 'Features Scoped',      unit: '' },
  'project-management': { label: 'Tasks Organised',   unit: '' },
  academic:           { label: 'Papers Reviewed',      unit: '' },
  'game-development': { label: 'Systems Designed',     unit: '' },
  gis:                { label: 'Datasets Processed',   unit: '' },
  'paid-media':       { label: 'Ad Sets Optimised',    unit: '' },
  'spatial-computing':{ label: 'Environments Mapped',  unit: '' },
  specialized:        { label: 'Tasks Completed',      unit: '' },
};

// Stable seed from agent id — gives each agent a consistent "pre-existing" baseline
function agentSeed(id) {
  let h = 5381;
  for (const c of id) h = ((h << 5) + h + c.charCodeAt(0)) & 0x7fff;
  return h;
}

export function useMetrics() {
  const [metrics, setMetrics] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agency_metrics') || '{}'); }
    catch { return {}; }
  });

  const track = useCallback((agentId, action) => {
    setMetrics(prev => {
      const entry = prev[agentId] || {};
      const next = {
        ...prev,
        [agentId]: {
          ...entry,
          [action]: (entry[action] || 0) + 1,
          lastActive: Date.now(),
        },
      };
      try { localStorage.setItem('agency_metrics', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const getAgentMetrics = useCallback((agent) => {
    const stored = metrics[agent.id] || {};
    const seed = agentSeed(agent.id);
    const accessed = stored.accessed || 0;
    const briefed  = stored.briefed  || 0;
    // Primary metric: stable seed-based baseline + bonus from real interactions
    const primaryValue = Math.floor(seed / 55) + accessed * 8 + briefed * 4;
    return {
      accessed,
      briefed,
      lastActive: stored.lastActive || null,
      primaryValue,
      hasRealActivity: accessed > 0 || briefed > 0,
    };
  }, [metrics]);

  return { track, getAgentMetrics };
}
