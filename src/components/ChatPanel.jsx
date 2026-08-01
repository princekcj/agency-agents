import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Settings, Bot, User, Loader, Key, Trash2, Download } from 'lucide-react';
import ErrorBanner from './ErrorBanner.jsx';
import { FREE_MODELS, OPENROUTER_FREE_MODELS_URL, normalizeFreeModel } from '../lib/freeModels.js';


const LS_KEY = 'agency_openrouter_key';
const LS_MDL = 'agency_openrouter_model';

function sanitizeHeaderValue(value) {
  return String(value || '').replace(/[^\x20-\x7E]/g, '').trim();
}

function buildSystemPrompt(agent) {
  return `You are ${agent.name}, a specialized AI agent in The Agency.
Division: ${agent.divisionLabel}
${agent.description ? `Description: ${agent.description}` : ''}
${agent.vibe ? `Vibe: "${agent.vibe}"` : ''}

Your full agent specification follows. Stay in character and respond according to your role.

---

${agent.content}`;
}

function downloadMarkdown(agent, messages) {
  const lines = [
    `# Chat with ${agent.name}`,
    `**Division:** ${agent.divisionLabel}`,
    `**Exported:** ${new Date().toLocaleString()}`,
    '',
    '---',
    '',
  ];
  for (const m of messages) {
    lines.push(`## ${m.role === 'user' ? 'You' : agent.name}`);
    lines.push('');
    lines.push(m.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-${agent.slug || agent.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatPanel({ agent, onClose, initialContext }) {
  const [apiKey, setApiKey]     = useState(() => sanitizeHeaderValue(localStorage.getItem(LS_KEY) || ''));
  const [model, setModel]       = useState(() => normalizeFreeModel(localStorage.getItem(LS_MDL) || FREE_MODELS[0].id));
  const [messages, setMessages] = useState(() => {
    if (initialContext) {
      return [{ role: 'assistant', content: initialContext }];
    }
    return [];
  });
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput]         = useState('');
  const [error, setError]               = useState('');
  const [errorCode, setErrorCode]       = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const hasKey = !!apiKey;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (hasKey) inputRef.current?.focus();
  }, [hasKey]);

  const saveKey = () => {
    const raw = keyInput.trim();
    const k = sanitizeHeaderValue(raw);
    if (!k) return;
    if (k !== raw) setError('Some characters were removed from your key (e.g. em-dashes from copy-paste). Verify the key looks correct.');
    localStorage.setItem(LS_KEY, k);
    setApiKey(k);
    setKeyInput('');
    setShowSettings(false);
  };

  const saveModel = (m) => { const freeModel = normalizeFreeModel(m); setModel(freeModel); localStorage.setItem(LS_MDL, freeModel); };
  const clearHistory = () => setMessages([]);
  const exportChat = () => { if (messages.length) downloadMarkdown(agent, messages); };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const cleanKey = sanitizeHeaderValue(apiKey);
    if (!text || loading || !cleanKey) return;

    if (cleanKey !== apiKey) {
      localStorage.setItem(LS_KEY, cleanKey);
      setApiKey(cleanKey);
    }

    setInput('');
    setError('');
    setErrorCode('');
    const userMsg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-openrouter-key': cleanKey },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: buildSystemPrompt(agent) },
            ...history,
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        setErrorCode(data.code || '');
      } else {
        const reply = data.choices?.[0]?.message?.content || '(no response)';
        setMessages([...history, { role: 'assistant', content: reply }]);
      }
    } catch (e) {
      setError(`Failed to send: ${e.message}`);
      setErrorCode('NETWORK_ERROR');
    } finally {
      setLoading(false);
    }
  }, [input, loading, apiKey, model, messages, agent]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const modelLabel = FREE_MODELS.find(m => m.id === model)?.label || model;

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-agent">
          <span className="chat-header-emoji">{agent.emoji}</span>
          <div>
            <div className="chat-header-name">{agent.name}</div>
            <div className="chat-header-div" style={{ color: agent.divisionColor }}>{agent.divisionLabel}</div>
          </div>
        </div>
        <div className="chat-header-actions">
          {messages.length > 0 && (
            <button className="chat-icon-btn" title="Export chat as markdown" onClick={exportChat}>
              <Download size={13} />
            </button>
          )}
          <button className="chat-icon-btn" title="Clear history" onClick={clearHistory}><Trash2 size={13} /></button>
          <button className="chat-icon-btn" title="Settings" onClick={() => setShowSettings(s => !s)}>
            <Settings size={13} />
          </button>
          <button className="chat-icon-btn" onClick={onClose}><X size={13} /></button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="chat-settings">
          <div className="chat-settings-row"><Key size={11} /><span>OpenRouter API Key</span></div>
          <div className="chat-settings-keyrow">
            <input
              className="chat-key-input"
              type="password"
              placeholder={apiKey ? '••••••••••••••••' : 'sk-or-v1-...  (free at openrouter.ai)'}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveKey()}
            />
            <button className="chat-save-btn" onClick={saveKey}>Save</button>
          </div>
          <div className="chat-settings-row" style={{ marginTop: 10 }}><Bot size={11} /><span>Free Model</span><a href={OPENROUTER_FREE_MODELS_URL} target="_blank" rel="noreferrer" className="chat-settings-link">OpenRouter free list</a></div>
          <div className="chat-model-list">
            {FREE_MODELS.map(m => (
              <button key={m.id} className={`chat-model-btn ${model === m.id ? 'active' : ''}`} onClick={() => saveModel(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No key prompt */}
      {!hasKey && !showSettings && (
        <div className="chat-nokey">
          <Key size={28} style={{ opacity: 0.4, marginBottom: 12 }} />
          <div className="chat-nokey-title">OpenRouter API Key Required</div>
          <div className="chat-nokey-sub">Free models available — no payment needed.</div>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="chat-link-btn">
            Get a free key at openrouter.ai
          </a>
          <button className="chat-action-btn" onClick={() => setShowSettings(true)}>
            <Key size={13} /> Enter Key
          </button>
        </div>
      )}

      {/* Messages */}
      {hasKey && (
        <>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <span className="chat-empty-emoji">{agent.emoji}</span>
                <div className="chat-empty-name">{agent.name}</div>
                <div className="chat-empty-hint">
                  {initialContext ? 'Pipeline result loaded. Continue the conversation.' : 'Start a conversation. The agent is ready.'}
                </div>
                <div className="chat-empty-model"><Bot size={10} /> {modelLabel}</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-msg-avatar">
                  {m.role === 'user' ? <User size={12} /> : agent.emoji}
                </div>
                <div className="chat-msg-body">
                  <div className="chat-msg-label">{m.role === 'user' ? 'You' : agent.name}</div>
                  <div className="chat-msg-text">{m.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-msg assistant">
                <div className="chat-msg-avatar">{agent.emoji}</div>
                <div className="chat-msg-body">
                  <div className="chat-msg-label">{agent.name}</div>
                  <div className="chat-typing"><span /><span /><span /></div>
                </div>
              </div>
            )}
            {error && (
              <ErrorBanner
                msg={error}
                code={errorCode}
                onOpenSettings={() => setShowSettings(true)}
              />
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder={`Message ${agent.name}...`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
            />
            <button className="chat-send-btn" onClick={sendMessage} disabled={!input.trim() || loading}>
              {loading ? <Loader size={14} className="spin" /> : <Send size={14} />}
            </button>
          </div>
          <div className="chat-footer-model">
            <Bot size={9} /> {modelLabel} · <button className="chat-model-change" onClick={() => setShowSettings(true)}>change</button>
          </div>
        </>
      )}
    </div>
  );
}
