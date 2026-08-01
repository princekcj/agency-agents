import React, { useState, useRef, useEffect } from 'react';
import { X, Zap, Check, Terminal, MessageSquare } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket.js';

const TOOLS = [
  { id: 'claude-code', label: 'Claude Code', accent: '#D97757', icon: '🤖' },
  { id: 'gemini-cli',  label: 'Gemini CLI',  accent: '#4285F4', icon: '💎' },
  { id: 'codex',       label: 'Codex',       accent: '#10A37F', icon: '🧠' },
  { id: 'copilot',     label: 'Copilot',     accent: '#6E40C9', icon: '🐙' },
  { id: 'cursor',      label: 'Cursor',      accent: '#1F6FEB', icon: '⚡' },
  { id: 'opencode',    label: 'opencode',    accent: '#FF6B35', icon: '🔥' },
  { id: 'qwen',        label: 'Qwen Code',   accent: '#615CED', icon: '🌊' },
  { id: 'windsurf',    label: 'Windsurf',    accent: '#09B6A2', icon: '🏄' },
  { id: 'aider',       label: 'Aider',       accent: '#8B5CF6', icon: '🔧' },
  { id: 'zcode',       label: 'ZCode',       accent: '#4263EB', icon: '⚙️' },
  { id: 'openclaw',    label: 'OpenClaw',    accent: '#E11D48', icon: '🦅' },
  { id: 'vibe',        label: 'Mistral Vibe',accent: '#FA520F', icon: '🎵' },
];

export default function DeployModal({ agent, onClose, onChat }) {
  const [selected, setSelected] = useState([]);
  const [phase, setPhase]       = useState('pick'); // 'pick' | 'deploying' | 'done'
  const [logs, setLogs]         = useState([]);
  const [exitCode, setExitCode] = useState(null);
  const termRef = useRef(null);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [logs]);

  useWebSocket(React.useCallback((msg) => {
    if (phase !== 'deploying') return;
    if (msg.type === 'install_log')   setLogs(p => [...p, msg.text]);
    if (msg.type === 'install_error') { setLogs(p => [...p, `[ERR] ${msg.text}`]); setPhase('done'); setExitCode(1); }
    if (msg.type === 'install_done')  { setPhase('done'); setExitCode(msg.exitCode); }
  }, [phase]));

  const toggleTool = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const deploy = async () => {
    if (!selected.length) return;
    setPhase('deploying');
    setLogs([`> Deploying ${agent.name} to: ${selected.join(', ')}\n`]);
    await fetch('/api/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: `${agent.division}/${agent.slug}`, tools: selected }),
    });
  };

  const handleChat = () => {
    onClose();
    onChat?.(agent);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="deploy-modal" onClick={e => e.stopPropagation()}>
        <div className="deploy-modal-header">
          <span className="deploy-modal-emoji">{agent.emoji}</span>
          <div>
            <div className="deploy-modal-title">Deploy Agent</div>
            <div className="deploy-modal-sub">{agent.name} · {agent.divisionLabel}</div>
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={14} /></button>
        </div>

        {phase === 'pick' && (
          <>
            <div className="deploy-modal-hint">Select tools to deploy this agent into:</div>
            <div className="deploy-tools-grid">
              {TOOLS.map(t => (
                <button
                  key={t.id}
                  className={`deploy-tool-btn ${selected.includes(t.id) ? 'active' : ''}`}
                  style={{ '--tool-accent': t.accent }}
                  onClick={() => toggleTool(t.id)}
                >
                  <span className="deploy-tool-icon">{t.icon}</span>
                  <span className="deploy-tool-label">{t.label}</span>
                  {selected.includes(t.id) && <Check size={11} className="deploy-tool-check" />}
                </button>
              ))}
            </div>
            <div className="deploy-modal-footer">
              <span className="deploy-selected-count">
                {selected.length > 0 ? `${selected.length} tool${selected.length > 1 ? 's' : ''} selected` : 'Select at least one tool'}
              </span>
              <button className="deploy-action-btn" disabled={!selected.length} onClick={deploy}>
                <Zap size={13} /> Deploy
              </button>
            </div>
          </>
        )}

        {(phase === 'deploying' || phase === 'done') && (
          <div className="deploy-terminal-wrap">
            <div className="deploy-term-label">
              <Terminal size={11} />
              {phase === 'deploying' ? 'Installing...' : exitCode === 0 ? '✓ Deployed successfully' : `Finished (exit ${exitCode})`}
            </div>
            <div className="terminal deploy-terminal" ref={termRef}>
              {logs.map((l, i) => (
                <span key={i} className={
                  l.includes('[OK]') || l.includes('✓') || l.includes('complete') ? 'terminal-line-ok' :
                  l.includes('[ERR]') || l.includes('error') ? 'terminal-line-err' : ''
                }>{l}</span>
              ))}
              {phase === 'deploying' && <span className="terminal-cursor" />}
            </div>
            {phase === 'done' && (
              <div className="deploy-done-actions">
                <button className="deploy-action-btn deploy-chat-btn" onClick={handleChat}>
                  <MessageSquare size={13} /> Chat with {agent.name}
                </button>
                <button className="deploy-action-btn" onClick={onClose}>
                  <Check size={13} /> Done
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
