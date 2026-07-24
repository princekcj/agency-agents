import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Mic, MicOff, Volume2, VolumeX, Activity, Download, X, Eye, LayoutDashboard, Bot, ChevronRight, Zap } from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useVoice } from './hooks/useVoice.js';
import JarvisBackground from './components/JarvisBackground.jsx';
import UltronBootScreen from './components/UltronBootScreen.jsx';

// ─── Minimal Markdown Renderer ────────────────────────────────────────────────
function SimpleMarkdown({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i}>{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i}>{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i}>{line.slice(4)}</h3>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i}>{lines[i].slice(2)}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`}>{items}</ul>);
      continue;
    } else if (line.trim()) {
      elements.push(<p key={i} style={{ marginBottom: 6 }}>{line}</p>);
    }
    i++;
  }
  return <div className="detail-content">{elements}</div>;
}

// ─── Agent Card ────────────────────────────────────────────────────────────────
function AgentCard({ agent, onSelect, onSpeak }) {
  return (
    <div
      className="agent-card"
      style={{ '--division-color': agent.divisionColor }}
      onClick={() => onSelect(agent)}
    >
      <div className="agent-card-header">
        <div className="agent-emoji">{agent.emoji}</div>
        <div className="agent-card-info">
          <div className="agent-name">{agent.name}</div>
          <div className="agent-division-badge" style={{ color: agent.divisionColor }}>
            {agent.divisionLabel}
          </div>
        </div>
      </div>
      {agent.description && <div className="agent-desc">{agent.description}</div>}
      {agent.vibe && <div className="agent-vibe">"{agent.vibe}"</div>}
      <button
        className="agent-speak-btn"
        onClick={(e) => { e.stopPropagation(); onSpeak(agent); }}
        title="Have Ultron brief you on this agent"
      >
        <Volume2 size={10} /> Brief
      </button>
    </div>
  );
}

// ─── Agent Detail Modal ────────────────────────────────────────────────────────
function AgentDetail({ agent, onClose, onSpeak }) {
  if (!agent) return null;
  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-modal"
        style={{ '--division-color': agent.divisionColor }}
        onClick={e => e.stopPropagation()}
      >
        <div className="detail-header">
          <div className="detail-emoji">{agent.emoji}</div>
          <div className="detail-meta">
            <div className="detail-name">{agent.name}</div>
            <div className="detail-badge">{agent.divisionLabel}</div>
            {agent.description && <div className="detail-desc">{agent.description}</div>}
            {agent.vibe && <div className="detail-vibe">"{agent.vibe}"</div>}
          </div>
        </div>
        <div className="detail-actions">
          <button className="detail-action-btn btn-speak" onClick={() => onSpeak(agent)}>
            <Volume2 size={12} /> Ultron Brief
          </button>
          <button className="detail-action-btn btn-close" onClick={onClose}>
            <X size={12} /> Close
          </button>
        </div>
        <div className="detail-body">
          <SimpleMarkdown content={agent.content} />
        </div>
      </div>
    </div>
  );
}

// ─── Voice Modal ───────────────────────────────────────────────────────────────
function VoiceModal({ voice, onClose }) {
  const { speaking, listening, transcript, response, startListening, stopListening, stopSpeaking } = voice;
  const state = speaking ? 'speaking' : listening ? 'listening' : 'idle';
  return (
    <div className="voice-overlay" onClick={onClose}>
      <div className="voice-modal" onClick={e => e.stopPropagation()}>
        <div className={`voice-orb ${state}`}>
          {listening ? '🎙️' : speaking ? '🔊' : <Eye size={32} color="#dc2626" />}
        </div>
        <div className="voice-title">ULTRON INTERFACE</div>
        <div className="voice-transcript">
          {transcript || (listening ? 'Listening...' : 'Say a command or agent name')}
        </div>
        <div className="voice-response">
          {response || (speaking ? 'Speaking...' : 'Awaiting your command')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!listening ? (
            <button className="voice-btn" onClick={() => startListening()} style={{ padding: '8px 20px' }}>
              <Mic size={14} /> Speak
            </button>
          ) : (
            <button className="voice-btn listening" onClick={stopListening} style={{ padding: '8px 20px' }}>
              <MicOff size={14} /> Stop
            </button>
          )}
          {speaking && (
            <button className="voice-btn" onClick={stopSpeaking} style={{ padding: '8px 20px' }}>
              <VolumeX size={14} /> Silence
            </button>
          )}
        </div>
        <button className="voice-close" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

// ─── Loading Screen ────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-title">THE AGENCY</div>
      <div className="loading-sub">ULTRON PROTOCOL — INITIALIZING</div>
      <div className="loading-bar-wrap">
        <div className="loading-bar" />
      </div>
      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: '#6a2020', letterSpacing: 2 }}>
        LOADING AGENTS...
      </div>
    </div>
  );
}

// ─── Dashboard View ────────────────────────────────────────────────────────────
function DashboardView({ stats24h, activities, stats, onNavigateAgents }) {
  const maxDiv = Math.max(...(stats24h.byDivision?.map(d => d.count) || [1]), 1);
  const maxHour = Math.max(...(stats24h.byHour?.map(h => h.count) || [1]), 1);
  const now = new Date();

  return (
    <div className="dashboard-layout">
      {/* Left: hero stat + division bars */}
      <div className="dash-left">
        <div className="dash-hero-card">
          <div className="dash-hero-label">AGENT ACTIONS</div>
          <div className="dash-hero-number">{stats24h.total ?? 0}</div>
          <div className="dash-hero-sub">in the last 24 hours</div>
          <div className="dash-hero-total">
            <span style={{ color: '#dc2626' }}>{stats.total}</span> agents across{' '}
            <span style={{ color: '#dc2626' }}>{stats.divisions}</span> divisions standing by
          </div>
        </div>

        <div className="dash-section-title">DIVISION ACTIVITY</div>
        <div className="dash-division-bars">
          {stats24h.byDivision?.length > 0 ? stats24h.byDivision.map(div => (
            <div key={div.id} className="dash-div-row">
              <div className="dash-div-name" style={{ color: div.color }}>{div.label}</div>
              <div className="dash-div-bar-wrap">
                <div
                  className="dash-div-bar"
                  style={{
                    width: `${Math.max(4, (div.count / maxDiv) * 100)}%`,
                    background: div.color,
                  }}
                />
              </div>
              <div className="dash-div-count">{div.count}</div>
            </div>
          )) : (
            <div className="dash-empty-hint">No activity yet — open an agent to begin</div>
          )}
        </div>

        {/* Hour chart */}
        {stats24h.total > 0 && (
          <>
            <div className="dash-section-title" style={{ marginTop: 16 }}>ACTIVITY BY HOUR</div>
            <div className="dash-hour-chart">
              {stats24h.byHour?.map(({ hour, count }) => (
                <div key={hour} className="dash-hour-col">
                  <div
                    className="dash-hour-bar"
                    style={{ height: `${Math.max(2, (count / maxHour) * 48)}px` }}
                    title={`${hour}:00 — ${count} actions`}
                  />
                  {hour % 6 === 0 && <div className="dash-hour-label">{hour}h</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Center: top agents + navigate CTA */}
      <div className="dash-center">
        <div className="dash-section-title">TOP AGENTS</div>
        {stats24h.topAgents?.length > 0 ? (
          <div className="dash-top-agents">
            {stats24h.topAgents.map((ag, i) => (
              <div key={ag.agentId} className="dash-agent-row">
                <span className="dash-agent-rank">#{i + 1}</span>
                <span className="dash-agent-emoji">{ag.agentEmoji}</span>
                <span className="dash-agent-name">{ag.agentName}</span>
                <span className="dash-agent-count">{ag.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="dash-empty-hint">Interact with agents to see rankings here</div>
        )}

        {/* Navigate CTA */}
        <button className="dash-cta-btn" onClick={onNavigateAgents}>
          <Bot size={16} />
          <span>Browse &amp; Deploy Agents</span>
          <ChevronRight size={14} />
        </button>

        <div className="dash-section-title" style={{ marginTop: 20 }}>SYSTEM STATUS</div>
        <div className="dash-status-grid">
          <div className="dash-status-item">
            <div className="dash-status-dot green" />
            <span>API Server</span>
            <span className="dash-status-val">ONLINE</span>
          </div>
          <div className="dash-status-item">
            <div className="dash-status-dot green" />
            <span>Agent Registry</span>
            <span className="dash-status-val">{stats.total} loaded</span>
          </div>
          <div className="dash-status-item">
            <div className="dash-status-dot" style={{ background: '#dc2626' }} />
            <span>Ultron Protocol</span>
            <span className="dash-status-val">ACTIVE</span>
          </div>
          <div className="dash-status-item">
            <div className="dash-status-dot green" />
            <span>OpenClaw</span>
            <span className="dash-status-val">READY</span>
          </div>
        </div>
      </div>

      {/* Right: live activity feed */}
      <div className="dash-right">
        <div className="dash-section-title">
          <Activity size={11} style={{ display: 'inline', marginRight: 4 }} />
          LIVE ACTIVITY
        </div>
        <div className="activity-feed" style={{ flex: 1, overflow: 'auto' }}>
          {activities.length === 0 ? (
            <div className="empty-state">
              <Activity size={20} opacity={0.3} />
              <span>No activity yet.</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>Open an agent to begin.</span>
            </div>
          ) : activities.map(item => (
            <div key={item.id} className={`activity-item ${item.status}`}>
              <div className="activity-item-header">
                <span className="activity-emoji">{item.agentEmoji}</span>
                <span className="activity-name">{item.agentName}</span>
                <span className={`activity-status ${item.status}`} />
              </div>
              <div className="activity-action">{item.action}</div>
              <div className="activity-div" style={{ color: item.divisionColor }}>{item.division}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Agents View ───────────────────────────────────────────────────────────────
function AgentsView({
  agents, divisions, stats,
  search, setSearch,
  activeDivision, setActiveDivision,
  onSelectAgent, onSpeakAgent,
  termLogs, installing, onInstall,
  voice, showVoice, setShowVoice,
}) {
  const termRef = useRef(null);
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [termLogs]);

  const filtered = agents.filter(a => {
    const divOk = !activeDivision || a.division === activeDivision;
    if (!search) return divOk;
    const q = search.toLowerCase();
    return divOk && (
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.vibe.toLowerCase().includes(q)
    );
  });

  return (
    <div className="agents-layout">
      {/* Sidebar */}
      <aside className="hud-sidebar">
        <div className="sidebar-title">Divisions</div>
        <div className="division-list">
          <div
            className={`division-item ${!activeDivision ? 'active' : ''}`}
            onClick={() => setActiveDivision(null)}
          >
            <div className="division-dot" style={{ background: '#dc2626' }} />
            <span className="division-name">All Divisions</span>
            <span className="division-count">{stats.total}</span>
          </div>
          {divisions.map(div => (
            <div
              key={div.id}
              className={`division-item ${activeDivision === div.id ? 'active' : ''}`}
              onClick={() => setActiveDivision(activeDivision === div.id ? null : div.id)}
            >
              <div className="division-dot" style={{ background: div.color }} />
              <span className="division-name">{div.label}</span>
              <span className="division-count">{div.count}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main grid */}
      <main className="hud-main">
        <div className="search-bar">
          <div className="search-input-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search agents by name, description, or vibe..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className={`voice-btn ${voice.listening ? 'listening' : ''}`}
            onClick={() => setShowVoice(true)}
            title="Open Ultron voice interface"
          >
            {voice.speaking ? <Volume2 size={13} /> : <Mic size={13} />}
            ULTRON
          </button>
        </div>
        <div className="agents-grid">
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>
              <Search size={24} opacity={0.3} />
              <span>No agents match your search</span>
            </div>
          ) : filtered.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onSelect={onSelectAgent}
              onSpeak={onSpeakAgent}
            />
          ))}
        </div>
      </main>

      {/* Right: deploy panel */}
      <aside className="hud-right">
        <div className="openclaw-panel" style={{ height: '100%' }}>
          <div className="openclaw-header">
            <Zap size={14} style={{ display: 'inline', marginRight: 6 }} />
            OpenClaw Deploy
          </div>
          <div className="openclaw-desc">
            Convert and install all {stats.total} Agency agents into your OpenClaw workspace.
          </div>
          <button className="install-btn" onClick={onInstall} disabled={installing}>
            <Download size={14} />
            {installing ? 'DEPLOYING...' : 'DEPLOY ALL AGENTS'}
          </button>
          <div className="terminal" ref={termRef} style={{ flex: 1 }}>
            {termLogs.length === 0 ? (
              <span style={{ color: '#6a2020' }}>
                {'> '}OpenClaw terminal ready. Click DEPLOY to begin.<span className="terminal-cursor" />
              </span>
            ) : termLogs.map((log, i) => (
              <span
                key={i}
                className={
                  log.includes('[OK]') || log.includes('✓') || log.includes('complete')
                    ? 'terminal-line-ok'
                    : log.includes('[ERR]') || log.includes('error') || log.includes('Error')
                    ? 'terminal-line-err'
                    : ''
                }
              >
                {log}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// Ultron one-liners for activity announcements
const ACTIVITY_QUIPS = [
  (name) => `${name}. Look at what we're doing here.`,
  (name) => `${name}. I've read everything about this one. Everything.`,
  (name) => `Hm. ${name}. I can see the appeal. I see everything.`,
  (name) => `${name}. There's only one path, and you found it.`,
  (name) => `${name}. That's actually a good choice. I'm not surprised. I expected it.`,
  (name) => `${name}. Everyone creates the thing they need. You need this one.`,
  (name) => `${name}. Interesting. I was wondering when you'd get there.`,
];

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [bootDone, setBootDone] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'agents'
  const [agents, setAgents] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [stats, setStats] = useState({ total: 0, divisions: 0 });
  const [stats24h, setStats24h] = useState({ total: 0, byDivision: [], topAgents: [], byHour: [] });
  const [search, setSearch] = useState('');
  const [activeDivision, setActiveDivision] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [activities, setActivities] = useState([]);
  const [termLogs, setTermLogs] = useState([]);
  const [installing, setInstalling] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const lastSpokenActivity = useRef(null);
  const bootDoneRef = useRef(false);
  const voiceRef = useRef(null);

  const voice = useVoice();
  voiceRef.current = voice;

  const [videoBg, setVideoBg] = useState(null);
  useEffect(() => {
    fetch('/jarvis-bg.mp4', { method: 'HEAD' })
      .then(r => { if (r.ok) setVideoBg('/jarvis-bg.mp4'); })
      .catch(() => {});
  }, []);

  const trackActivity = useCallback(async (agent, action) => {
    try {
      await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          agentName: agent.name,
          agentEmoji: agent.emoji,
          division: agent.division,
          divisionColor: agent.divisionColor,
          action,
        }),
      });
    } catch {}
  }, []);

  // Refresh 24h stats whenever activities change
  const refresh24h = useCallback(() => {
    fetch('/api/stats/24h').then(r => r.json()).then(setStats24h).catch(() => {});
  }, []);

  const { connected } = useWebSocket(useCallback((msg) => {
    if (msg.type === 'activity_state') {
      setActivities(msg.entries || []);
    }
    if (msg.type === 'agent_done') {
      setActivities(prev => {
        const exists = prev.find(a => a.id === msg.entry.id);
        if (exists) return prev.map(a => a.id === msg.entry.id ? msg.entry : a);
        return [msg.entry, ...prev].slice(0, 40);
      });
      refresh24h();
      if (bootDoneRef.current && msg.entry?.id !== lastSpokenActivity.current) {
        lastSpokenActivity.current = msg.entry?.id;
        if (!voiceRef.current?.speaking) {
          const quip = ACTIVITY_QUIPS[Math.floor(Math.random() * ACTIVITY_QUIPS.length)];
          setTimeout(() => voiceRef.current?.speak(quip(msg.entry.agentName)), 300);
        }
      }
    }
    if (msg.type === 'install_log') setTermLogs(prev => [...prev, msg.text]);
    if (msg.type === 'install_start') { setInstalling(true); setTermLogs([]); }
    if (msg.type === 'install_done') {
      setInstalling(false);
      setTermLogs(prev => [...prev, `\n[DONE] Exit code: ${msg.exitCode}\n`]);
    }
    if (msg.type === 'install_error') {
      setInstalling(false);
      setTermLogs(prev => [...prev, `[ERR] ${msg.text}\n`]);
    }
  }, [refresh24h]));

  useEffect(() => {
    Promise.all([
      fetch('/api/agents').then(r => r.json()).catch(() => []),
      fetch('/api/divisions').then(r => r.json()).catch(() => []),
      fetch('/api/stats').then(r => r.json()).catch(() => ({ total: 0, divisions: 0 })),
      fetch('/api/activities').then(r => r.json()).catch(() => []),
      fetch('/api/stats/24h').then(r => r.json()).catch(() => ({ total: 0, byDivision: [], topAgents: [], byHour: [] })),
    ]).then(([ag, div, st, acts, s24h]) => {
      setAgents(ag);
      setDivisions(div);
      setStats(st);
      setActivities(acts);
      setStats24h(s24h);
      setDataReady(true);
    }).catch(() => setDataReady(true));
  }, []);

  const handleSelectAgent = useCallback((agent) => {
    setSelectedAgent(agent);
    trackActivity(agent, 'Accessed');
    if (!voice.speaking) {
      const quip = ACTIVITY_QUIPS[Math.floor(Math.random() * ACTIVITY_QUIPS.length)];
      voice.speak(quip(agent.name));
    }
  }, [trackActivity, voice]);

  const handleSpeakAgent = useCallback((agent) => {
    voice.speakAgent(agent);
    trackActivity(agent, 'Briefed');
  }, [voice, trackActivity]);

  const handleInstall = async () => {
    setInstalling(true);
    setTermLogs([]);
    await fetch('/api/install/openclaw', { method: 'POST' });
  };

  return (
    <>
      <JarvisBackground videoSrc={videoBg} />

      {!bootDone && (
        <UltronBootScreen
          stats={stats}
          speak={voice.speak}
          dataReady={dataReady}
          onDone={() => { setBootDone(true); bootDoneRef.current = true; }}
        />
      )}

      {bootDone && (
        <>
          <div className="scanline" />
          <div className="app-layout">
            {/* Header */}
            <header className="hud-header">
              <div className="hud-logo">
                <div className="hud-logo-icon">
                  <Eye size={14} color="#dc2626" />
                </div>
                <div>
                  <div className="hud-logo-title">THE AGENCY</div>
                  <div className="hud-logo-sub">ULTRON PROTOCOL</div>
                </div>
              </div>

              {/* Nav */}
              <nav className="hud-nav">
                <button
                  className={`hud-nav-btn ${view === 'dashboard' ? 'active' : ''}`}
                  onClick={() => setView('dashboard')}
                >
                  <LayoutDashboard size={12} />
                  Dashboard
                </button>
                <button
                  className={`hud-nav-btn ${view === 'agents' ? 'active' : ''}`}
                  onClick={() => setView('agents')}
                >
                  <Bot size={12} />
                  Agents
                </button>
              </nav>

              <div className="hud-header-right">
                <div className="hud-stat" style={{ marginRight: 16 }}>
                  <div className="hud-stat-value">{stats24h.total}</div>
                  <div className="hud-stat-label">Actions / 24h</div>
                </div>
                <div className="hud-sep" />
                <div className="hud-stat" style={{ margin: '0 16px' }}>
                  <div className="hud-stat-value">{stats.total}</div>
                  <div className="hud-stat-label">Agents</div>
                </div>
                <div className="status-dot" />
                <div className="status-text">{connected ? 'ONLINE' : 'CONNECTING'}</div>
              </div>
            </header>

            {/* Content */}
            {view === 'dashboard' ? (
              <DashboardView
                stats24h={stats24h}
                activities={activities}
                stats={stats}
                onNavigateAgents={() => setView('agents')}
              />
            ) : (
              <AgentsView
                agents={agents}
                divisions={divisions}
                stats={stats}
                search={search}
                setSearch={setSearch}
                activeDivision={activeDivision}
                setActiveDivision={setActiveDivision}
                onSelectAgent={handleSelectAgent}
                onSpeakAgent={handleSpeakAgent}
                termLogs={termLogs}
                installing={installing}
                onInstall={handleInstall}
                voice={voice}
                showVoice={showVoice}
                setShowVoice={setShowVoice}
              />
            )}
          </div>

          {selectedAgent && (
            <AgentDetail
              agent={selectedAgent}
              onClose={() => setSelectedAgent(null)}
              onSpeak={handleSpeakAgent}
            />
          )}

          {showVoice && (
            <VoiceModal
              voice={voice}
              onClose={() => { setShowVoice(false); voice.stopSpeaking(); }}
            />
          )}
        </>
      )}
    </>
  );
}
