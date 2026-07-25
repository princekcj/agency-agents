import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, Play, ChevronRight, Loader, Trash2, Settings, Key, ArrowDown, Bot } from 'lucide-react';

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

export default function PipelineBuilder({ agents, onAddAgent }) {
  const [pipeline, setPipeline]     = useState([]);  // array of agent objects
  const [input, setInput]           = useState('');
  const [running, setRunning]       = useState(false);
  const [results, setResults]       = useState([]);  // per-step results
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey]         = useState(() => localStorage.getItem(LS_KEY) || '');
  const [keyInput, setKeyInput]     = useState('');
  const [model, setModel]           = useState(() => localStorage.getItem(LS_MDL) || FREE_MODELS[0].id);
  const [searchQ, setSearchQ]       = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results]);

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(LS_KEY, k);
    setApiKey(k);
    setKeyInput('');
    setShowSettings(false);
  };

  const saveModel = (m) => { setModel(m); localStorage.setItem(LS_MDL, m); };

  const addAgent = (agent) => {
    setPipeline(p => [...p, agent]);
    setShowPicker(false);
    setSearchQ('');
  };

  const removeAgent = (idx) => setPipeline(p => p.filter((_, i) => i !== idx));

  const runPipeline = useCallback(async () => {
    if (!pipeline.length || !input.trim() || !apiKey) return;
    setRunning(true);
    setResults([]);

    let currentInput = input.trim();

    for (let i = 0; i < pipeline.length; i++) {
      const agent = pipeline[i];
      setResults(r => [...r, { agent, status: 'running', output: '' }]);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-openrouter-key': apiKey,
          },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: 'system', content: buildSystemPrompt(agent) },
              {
                role: 'user',
                content: i === 0
                  ? currentInput
                  : `Previous agent output:\n\n${currentInput}\n\nContinue processing this according to your role.`,
              },
            ],
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

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

  const filtered = agents.filter(a => {
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.division.toLowerCase().includes(q);
  }).slice(0, 30);

  const modelLabel = FREE_MODELS.find(m => m.id === model)?.label || model;

  return (
    <div className="pipeline-layout">
      {/* Left: builder */}
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

        {/* Stages */}
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

        {/* Agent picker */}
        {showPicker && (
          <div className="pipeline-picker">
            <input
              className="pipeline-search"
              placeholder="Search agents..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              autoFocus
            />
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

      {/* Right: run */}
      <div className="pipeline-right">
        <div className="pipeline-section-title">RUN PIPELINE</div>

        {!apiKey && (
          <div className="chat-nokey" style={{ padding: 20 }}>
            <Key size={22} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div className="chat-nokey-title">API Key Required</div>
            <button className="chat-action-btn" onClick={() => setShowSettings(true)}><Key size={12} /> Enter Key</button>
          </div>
        )}

        {apiKey && (
          <>
            <textarea
              className="pipeline-input"
              placeholder="Enter your initial prompt or content to process through the pipeline..."
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={4}
            />
            <button
              className="pipeline-run-btn"
              disabled={!pipeline.length || !input.trim() || running}
              onClick={runPipeline}
            >
              {running
                ? <><Loader size={13} className="spin" /> Running...</>
                : <><Play size={13} /> Run Pipeline ({pipeline.length} agents)</>
              }
            </button>
            <div className="pipeline-model-hint">
              <Bot size={9} /> {modelLabel}
            </div>
          </>
        )}

        {/* Results */}
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
              {step.output && (
                <div className="pipeline-result-body">{step.output}</div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
