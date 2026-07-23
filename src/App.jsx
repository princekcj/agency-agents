import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Mic, MicOff, Volume2, VolumeX, Activity, Download, X, Zap } from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useVoice } from './hooks/useVoice.js';

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
        title="Have JARVIS brief you on this agent"
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
            <Volume2 size={12} /> JARVIS Brief
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

// ─── Activity Feed ─────────────────────────────────────────────────────────────
function ActivityFeed({ activities }) {
  const feedRef = useRef(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [activities]);

  const sorted = [...activities].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  return (
    <div className="activity-feed" ref={feedRef}>
      {sorted.length === 0 && (
        <div className="empty-state">
          <Activity size={24} opacity={0.3} />
          <span>Awaiting agent activity...</span>
        </div>
      )}
      {sorted.map(item => (
        <div key={item.id} className={`activity-item ${item.status}`}>
          <div className="activity-item-header">
            <span className="activity-emoji">{item.agentEmoji}</span>
            <span className="activity-name">{item.agentName}</span>
            <span className={`activity-status ${item.status}`} />
          </div>
          <div className="activity-action">{item.action}</div>
          {item.result && <div className="activity-result">{item.result}</div>}
          <div className="activity-div" style={{ color: item.divisionColor }}>{item.division}</div>
        </div>
      ))}
    </div>
  );
}

// ─── OpenClaw Panel ────────────────────────────────────────────────────────────
function OpenClawPanel({ logs, onInstall, installing }) {
  const termRef = useRef(null);
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="openclaw-panel">
      <div className="openclaw-header">OpenClaw Deployment</div>
      <div className="openclaw-desc">
        Convert and install all Agency agents into your OpenClaw workspace. Agents are deployed to{' '}
        <code style={{ fontFamily: 'monospace', fontSize: 10, color: '#e11d48' }}>~/.openclaw/agency-agents/</code>
      </div>
      <button className="install-btn" onClick={onInstall} disabled={installing}>
        <Download size={14} />
        {installing ? 'DEPLOYING...' : 'DEPLOY TO OPENCLAW'}
      </button>
      <div className="terminal" ref={termRef}>
        {logs.length === 0 ? (
          <span style={{ color: '#3a6a8a' }}>
            {'> '}OpenClaw terminal ready. Click DEPLOY to begin.<span className="terminal-cursor" />
          </span>
        ) : (
          logs.map((log, i) => (
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
          ))
        )}
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
          {listening ? '🎙️' : speaking ? '🔊' : '🤖'}
        </div>
        <div className="voice-title">JARVIS INTERFACE</div>
        <div className="voice-transcript">
          {transcript || (listening ? 'Listening...' : 'Say a command or agent name')}
        </div>
        <div className="voice-response">
          {response || (speaking ? 'Speaking...' : 'Awaiting input')}
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
              <VolumeX size={14} /> Mute
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
      <div className="loading-sub">JARVIS COMMAND CENTER — INITIALIZING</div>
      <div className="loading-bar-wrap">
        <div className="loading-bar" />
      </div>
      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: '#3a6a8a', letterSpacing: 2 }}>
        LOADING AGENTS...
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [stats, setStats] = useState({ total: 0, divisions: 0 });
  const [search, setSearch] = useState('');
  const [activeDivision, setActiveDivision] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [rightTab, setRightTab] = useState('activity');
  const [activities, setActivities] = useState([]);
  const [termLogs, setTermLogs] = useState([]);
  const [installing, setInstalling] = useState(false);
  const [showVoice, setShowVoice] = useState(false);

  const voice = useVoice();

  const { connected } = useWebSocket(useCallback((msg) => {
    if (msg.type === 'agent_start' || msg.type === 'agent_done') {
      setActivities(prev => {
        const exists = prev.find(a => a.id === msg.entry.id);
        if (exists) return prev.map(a => a.id === msg.entry.id ? msg.entry : a);
        return [msg.entry, ...prev].slice(0, 40);
      });
    }
    if (msg.type === 'install_log') {
      setTermLogs(prev => [...prev, msg.text]);
    }
    if (msg.type === 'install_start') {
      setInstalling(true);
      setTermLogs([]);
    }
    if (msg.type === 'install_done') {
      setInstalling(false);
      setTermLogs(prev => [...prev, `\n[DONE] Exit code: ${msg.exitCode}\n`]);
    }
    if (msg.type === 'install_error') {
      setInstalling(false);
      setTermLogs(prev => [...prev, `[ERR] ${msg.text}\n`]);
    }
    if (msg.type === 'connected') {
      voice.speak(msg.message);
    }
  }, [voice.speak]));

  useEffect(() => {
    Promise.all([
      fetch('/api/agents').then(r => r.json()).catch(() => []),
      fetch('/api/divisions').then(r => r.json()).catch(() => []),
      fetch('/api/stats').then(r => r.json()).catch(() => ({ total: 0, divisions: 0 })),
    ]).then(([ag, div, st]) => {
      setAgents(ag);
      setDivisions(div);
      setStats(st);
      setTimeout(() => setLoading(false), 600);
    }).catch(() => setLoading(false));
  }, []);

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

  const handleInstall = async () => {
    setRightTab('openclaw');
    setInstalling(true);
    setTermLogs([]);
    await fetch('/api/install/openclaw', { method: 'POST' });
  };

  return (
    <>
      <div className="hud-bg" />
      <div className="hud-grid" />

      {loading && <LoadingScreen />}

      {!loading && (
        <>
          <div className="scanline" />
          <div className="app-layout">
            {/* Header */}
            <header className="hud-header">
              <div className="hud-logo">
                <div className="hud-logo-icon">
                  <Zap size={14} color="#00d4ff" />
                </div>
                <div>
                  <div className="hud-logo-title">THE AGENCY</div>
                  <div className="hud-logo-sub">JARVIS Command Center</div>
                </div>
              </div>

              <div className="hud-header-center">
                <div className="hud-stat">
                  <div className="hud-stat-value">{stats.total}</div>
                  <div className="hud-stat-label">Agents</div>
                </div>
                <div className="hud-sep" />
                <div className="hud-stat">
                  <div className="hud-stat-value">{stats.divisions}</div>
                  <div className="hud-stat-label">Divisions</div>
                </div>
                <div className="hud-sep" />
                <div className="hud-stat">
                  <div className="hud-stat-value">{activities.filter(a => a.status === 'working').length}</div>
                  <div className="hud-stat-label">Active Now</div>
                </div>
                <div className="hud-sep" />
                <div className="hud-stat">
                  <div className="hud-stat-value">{filtered.length}</div>
                  <div className="hud-stat-label">Showing</div>
                </div>
              </div>

              <div className="hud-header-right">
                <div className="status-dot" />
                <div className="status-text">{connected ? 'ONLINE' : 'CONNECTING'}</div>
              </div>
            </header>

            {/* Sidebar */}
            <aside className="hud-sidebar">
              <div className="sidebar-title">Divisions</div>
              <div className="division-list">
                <div
                  className={`division-item ${!activeDivision ? 'active' : ''}`}
                  onClick={() => setActiveDivision(null)}
                >
                  <div className="division-dot" style={{ background: '#00d4ff' }} />
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

            {/* Main agent grid */}
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
                  title="Open JARVIS voice interface"
                >
                  {voice.speaking ? <Volume2 size={13} /> : <Mic size={13} />}
                  JARVIS
                </button>
              </div>

              <div className="agents-grid">
                {filtered.length === 0 ? (
                  <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                    <Search size={24} opacity={0.3} />
                    <span>No agents match your search</span>
                  </div>
                ) : (
                  filtered.map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onSelect={setSelectedAgent}
                      onSpeak={voice.speakAgent}
                    />
                  ))
                )}
              </div>
            </main>

            {/* Right panel */}
            <aside className="hud-right">
              <div className="panel-tabs">
                <div
                  className={`panel-tab ${rightTab === 'activity' ? 'active' : ''}`}
                  onClick={() => setRightTab('activity')}
                >
                  <Activity size={10} style={{ display: 'inline', marginRight: 4 }} />
                  Live Activity
                </div>
                <div
                  className={`panel-tab ${rightTab === 'openclaw' ? 'active' : ''}`}
                  onClick={() => setRightTab('openclaw')}
                >
                  <Download size={10} style={{ display: 'inline', marginRight: 4 }} />
                  OpenClaw
                </div>
              </div>
              <div className="panel-content">
                {rightTab === 'activity' ? (
                  <ActivityFeed activities={activities} />
                ) : (
                  <OpenClawPanel
                    logs={termLogs}
                    onInstall={handleInstall}
                    installing={installing}
                  />
                )}
              </div>
            </aside>
          </div>

          {selectedAgent && (
            <AgentDetail
              agent={selectedAgent}
              onClose={() => setSelectedAgent(null)}
              onSpeak={voice.speakAgent}
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
