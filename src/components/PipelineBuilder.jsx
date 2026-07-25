import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, Play, Loader, Settings, Key, ArrowDown, Bot, Download, MessageSquare, Send, User } from 'lucide-react';

const LS_KEY = 'agency_openrouter_key';
const LS_MDL = 'agency_openrouter_model';

const FREE_MODELS = [
  { id: 'meta-llama/llama-3.3-70b-instruct:free',   label: 'Llama 3.3 70B' },
  { id: 'deepseek/deepseek-r1:free',                 label: 'DeepSeek R1' },
  { id: 'deepseek/deepseek-chat-v3-0324:free',       label: 'DeepSeek V3' },
  { id: 'google/gemma-3-27b-it:free',                label: 'Gemma 3 27B' },
  { id: 'mistralai/mistral-7b-instruct:free',        label: 'Mistral 7B' },
];

function buildSystemPrompt(agent) {
  return `You are ${agent.name}, a specialized AI agent in The Agency.
Division: ${agent.divisionLabel}
${agent.description ? `Description: ${agent.description}` : ''}

Your full specification:
---
${agent.content}`;
}

function callAgent(agent, messages, apiKey, model) {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-openrouter-key': apiKey },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: 'system', content: buildSystemPrompt(agent) }, ...messages],
    }),
  }).then(r => r.json());
}

function downloadPipelineResults(pipeline, results, input) {
  const ts = new Date().toLocaleString();
  const lines = [
    `# Pipeline Results`,
    `**Agents:** ${pipeline.map(a => a.name).join(' → ')}`,
    `**Exported:** ${ts}`,
    '',
    '---',
    '',
    `## Initial Input`,
    '',
    input,
    '',
    '---',
    '',
  ];
  for (const step of results) {
    lines.push(`## ${step.agent.emoji} ${step.agent.name}`);
    lines.push(`*${step.agent.divisionLabel}*`);
    lines.push('');
    lines.push(step.output || '(no output)');
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pipeline-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PipelineBuilder({ agents }) {
  const [pipeline, setPipeline]       = useState([]);
  const [input, setInput]             = useState('');
  const [running, setRunning]         = useState(false);
  const [results, setResults]         = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey]           = useState(() => localStorage.getItem(LS_KEY) || '');
  const [keyInput, setKeyInput]       = useState('');
  const [model, setModel]             = useState(() => localStorage.getItem(LS_MDL) || FREE_MODELS[0].id);
  const [searchQ, setSearchQ]         = useState('');
  const [showPicker, setShowPicker]   = useState(false);

  // Post-run chat with the final agent
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]       = useState('');
  const [chatLoading, setChatLoading]   = useState(false);
  const [chatError, setChatError]       = useState('');

  const bottomRef    = useRef(null);
  const chatInputRef = useRef(null);

  const pipelineDone = results.length > 0 && results.every(r => r.status !== 'running');
  const lastResult   = results[results.length - 1];
  const lastAgent    = pipeline[pipeline.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results, chatMessages, chatLoading]);

  const saveKey  = () => { const k = keyInput.trim(); if (!k) return; localStorage.setItem(LS_KEY, k); setApiKey(k); setKeyInput(''); setShowSettings(false); };
  const saveModel = (m) => { setModel(m); localStorage.setItem(LS_MDL, m); };

  const addAgent    = (agent) => { setPipeline(p => [...p, agent]); setShowPicker(false); setSearchQ(''); };
  const removeAgent = (idx)  => setPipeline(p => p.filter((_, i) => i !== idx));

  const runPipeline = useCallback(async () => {
    if (!pipeline.length || !input.trim() || !apiKey) return;
    setRunning(true);
    setResults([]);
    setChatMessages([]);
    setChatError('');

    let currentInput = input.trim();

    for (let i = 0; i < pipeline.length; i++) {
      const agent = pipeline[i];
      setResults(r => [...r, { agent, status: 'running', output: '' }]);

      try {
        const userContent = i === 0
          ? currentInput
          : `Previous agent output:\n\n${currentInput}\n\nContinue processing this according to your role.`;

        const data = await callAgent(agent, [{ role: 'user', content: userContent }], apiKey, model);
        if (data.error) throw new Error(data.error);

        const output = data.choices?.[0]?.message?.content || '(no output)';
        currentInput = output;
        setResults(r => r.map((step, idx) => idx === i ? { ...step, status: 'done', output } : step));
      } catch (e) {
        setResults(r => r.map((step, idx) => idx === i ? { ...step, status: 'error', output: e.message } : step));
        break;
      }
    }

    setRunning(false);
  }, [pipeline, input, apiKey, model]);

  // Continue chatting with the final agent, with pipeline context
  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading || !apiKey || !lastAgent) return;
    setChatInput('');
    setChatError('');

    const pipelineContext = results
      .filter(r => r.status === 'done')
      .map(r => `[${r.agent.name}]: ${r.output}`)
      .join('\n\n---\n\n');

    const userMsg = { role: 'user', content: text };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setChatLoading(true);

    // System prompt: final agent + full pipeline context
    const systemWithContext = buildSystemPrompt(lastAgent) +
      `\n\n---\n\nFULL PIPELINE OUTPUT (from previous agents in this session):\n\n${pipelineContext}`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-openrouter-key': apiKey },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'system', content: systemWithContext }, ...history],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) setChatError('Invalid API key.');
        else if (res.status === 429) setChatError('Rate limit. Try another model.');
        else setChatError(data.error || `Error ${res.status}`);
      } else {
        const reply = data.choices?.[0]?.message?.content || '(no response)';
        setChatMessages([...history, { role: 'assistant', content: reply }]);
      }
    } catch (e) {
      setChatError(e.message);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, apiKey, model, chatMessages, lastAgent, results]);

  const onChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  };

  const filtered = agents.filter(a => {
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.division.toLowerCase().includes(q);
  }).slice(0, 30);

  const modelLabel = FREE_MODELS.find(m => m.id === model)?.label || model;

  return (
    <div className="pipeline-layout">
      {/* ── Left: builder ── */}
      <div className="pipeline-left">
        <div className="pipeline-section-title">
          AGENT PIPELINE
          <button className="pipeline-settings-btn" onClick={() => setShowSettings(s => !s)}>
            <Settings size={11} />
          </button>
        </div>

        {showSettings && (
          <div className="chat-settings" style={{ marginBottom: 12 }}>
            <div className="chat-settings-row"><Key size={11} /><span>OpenRouter Key</span></div>
            <div className="chat-settings-keyrow">
              <input className="chat-key-input" type="password"
                placeholder={apiKey ? '••••••••••••••••' : 'sk-or-v1-...'}
                value={keyInput} onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveKey()} />
              <button className="chat-save-btn" onClick={saveKey}>Save</button>
            </div>
            <div className="chat-settings-row" style={{ marginTop: 8 }}><Bot size={11} /><span>Model</span></div>
            <div className="chat-model-list">
              {FREE_MODELS.map(m => (
                <button key={m.id} className={`chat-model-btn ${model === m.id ? 'active' : ''}`} onClick={() => saveModel(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pipeline-stages">
          {pipeline.length === 0 && (
            <div className="pipeline-empty">Add agents below to build a pipeline</div>
          )}
          {pipeline.map((agent, i) => (
            <React.Fragment key={`${agent.id}-${i}`}>
              <div className="pipeline-stage">
                <div className="pipeline-stage-num">{i + 1}</div>
                <span className="pipeline-stage-emoji">{agent.emoji}</span>
                <div className="pipeline-stage-info">
                  <div className="pipeline-stage-name">{agent.name}</div>
                  <div className="pipeline-stage-div" style={{ color: agent.divisionColor }}>{agent.divisionLabel}</div>
                </div>
                <button className="pipeline-remove-btn" onClick={() => removeAgent(i)}><X size={11} /></button>
              </div>
              {i < pipeline.length - 1 && (
                <div className="pipeline-arrow"><ArrowDown size={12} /></div>
              )}
            </React.Fragment>
          ))}
          <button className="pipeline-add-btn" onClick={() => setShowPicker(s => !s)}>
            <Plus size={13} /> Add Agent
          </button>
        </div>

        {showPicker && (
          <div className="pipeline-picker">
            <input className="pipeline-search" placeholder="Search agents..."
              value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus />
            <div className="pipeline-picker-list">
              {filtered.map(a => (
                <button key={a.id} className="pipeline-pick-item" onClick={() => addAgent(a)}>
                  <span>{a.emoji}</span>
                  <div>
                    <div className="pipeline-pick-name">{a.name}</div>
                    <div className="pipeline-pick-div" style={{ color: a.divisionColor }}>{a.divisionLabel}</div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="pipeline-empty" style={{ padding: 12 }}>No matches</div>}
            </div>
          </div>
        )}
      </div>

      {/* ── Right: run + results + interactive chat ── */}
      <div className="pipeline-right">
        {/* Run controls */}
        <div className="pipeline-section-title">RUN PIPELINE</div>

        {!apiKey ? (
          <div className="chat-nokey" style={{ padding: 20 }}>
            <Key size={22} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div className="chat-nokey-title">API Key Required</div>
            <button className="chat-action-btn" onClick={() => setShowSettings(true)}><Key size={12} /> Enter Key</button>
          </div>
        ) : (
          <>
            <textarea className="pipeline-input"
              placeholder="Enter your initial prompt or content to process through the pipeline..."
              value={input} onChange={e => setInput(e.target.value)} rows={4}
            />
            <div className="pipeline-run-row">
              <button className="pipeline-run-btn"
                disabled={!pipeline.length || !input.trim() || running}
                onClick={runPipeline}
              >
                {running
                  ? <><Loader size={13} className="spin" /> Running...</>
                  : <><Play size={13} /> Run Pipeline ({pipeline.length} agent{pipeline.length !== 1 ? 's' : ''})</>
                }
              </button>
              {pipelineDone && (
                <button className="pipeline-export-btn"
                  title="Export results as markdown"
                  onClick={() => downloadPipelineResults(pipeline, results, input)}
                >
                  <Download size={13} /> Export
                </button>
              )}
            </div>
            <div className="pipeline-model-hint"><Bot size={9} /> {modelLabel}</div>
          </>
        )}

        {/* Step results */}
        {results.length > 0 && (
          <div className="pipeline-results">
            {results.map((step, i) => (
              <div key={i} className={`pipeline-result ${step.status}`}>
                <div className="pipeline-result-header">
                  <span>{step.agent.emoji}</span>
                  <span className="pipeline-result-name">{step.agent.name}</span>
                  <span className={`pipeline-result-badge ${step.status}`}>
                    {step.status === 'running' ? <Loader size={9} className="spin" /> : step.status}
                  </span>
                </div>
                {step.output && <div className="pipeline-result-body">{step.output}</div>}
              </div>
            ))}
          </div>
        )}

        {/* ── Interactive follow-up chat with final agent ── */}
        {pipelineDone && lastResult?.status === 'done' && lastAgent && apiKey && (
          <div className="pipeline-chat-section">
            <div className="pipeline-chat-header">
              <MessageSquare size={12} />
              <span>Continue with {lastAgent.emoji} {lastAgent.name}</span>
              <span className="pipeline-chat-hint">Ask follow-up questions using pipeline context</span>
            </div>

            <div className="pipeline-chat-messages">
              {chatMessages.length === 0 && (
                <div className="pipeline-chat-empty">
                  Ask {lastAgent.name} a follow-up question. It has full context from the pipeline run.
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`pipeline-chat-msg ${m.role}`}>
                  <div className="pipeline-chat-avatar">
                    {m.role === 'user' ? <User size={11} /> : lastAgent.emoji}
                  </div>
                  <div className="pipeline-chat-bubble">
                    <div className="pipeline-chat-label">{m.role === 'user' ? 'You' : lastAgent.name}</div>
                    <div className="pipeline-chat-text">{m.content}</div>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="pipeline-chat-msg assistant">
                  <div className="pipeline-chat-avatar">{lastAgent.emoji}</div>
                  <div className="pipeline-chat-bubble">
                    <div className="pipeline-chat-label">{lastAgent.name}</div>
                    <div className="chat-typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              {chatError && <div className="chat-error">{chatError}</div>}
              <div ref={bottomRef} />
            </div>

            <div className="pipeline-chat-input-row">
              <textarea
                ref={chatInputRef}
                className="pipeline-chat-input"
                placeholder={`Ask ${lastAgent.name} a follow-up...`}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={onChatKeyDown}
                rows={1}
              />
              <button className="chat-send-btn"
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || chatLoading}
              >
                {chatLoading ? <Loader size={13} className="spin" /> : <Send size={13} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
