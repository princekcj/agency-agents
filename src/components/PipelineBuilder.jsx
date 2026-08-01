import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, Play, Loader, Settings, Key, ArrowDown, Bot, Download, MessageSquare, Send, User, Clock, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, RefreshCw, AlertTriangle } from 'lucide-react';
import ErrorBanner from './ErrorBanner.jsx';
import { FREE_MODELS, OPENROUTER_FREE_MODELS_URL, normalizeFreeModel } from '../lib/freeModels.js';

const LS_KEY = 'agency_openrouter_key';
const LS_MDL = 'agency_openrouter_model';
const LS_SCHEDULER_TOKEN = 'agency_scheduler_token';
const LS_PIPELINES = 'agency_saved_pipelines';

function sanitizeHeaderValue(value) {
  return String(value || '').replace(/[^\x20-\x7E]/g, '').trim();
}

function buildSystemPrompt(agent) {
  return `You are ${agent.name}, a specialized AI agent in The Agency.
Division: ${agent.divisionLabel}
${agent.description ? `Description: ${agent.description}` : ''}

Your full specification:
---
${agent.content}`;
}

function defaultStepConfig() {
  return { stepPrompt: '', inputInstruction: '', outputInstruction: '' };
}

function loadSavedPipelines() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_PIPELINES) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function callAgent(agent, messages, apiKey, model, schedulerToken = '', extraSystemInstructions = '') {
  const headers = {
    'Content-Type': 'application/json',
    'x-openrouter-key': sanitizeHeaderValue(apiKey),
  };
  const cleanSchedulerToken = sanitizeHeaderValue(schedulerToken);
  if (cleanSchedulerToken) headers['x-scheduler-token'] = cleanSchedulerToken;

  const systemContent = buildSystemPrompt(agent) +
    (extraSystemInstructions ? `\n\n---\n\nStep Instructions:\n${extraSystemInstructions}` : '');

  return fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: 'system', content: systemContent }, ...messages],
    }),
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });
}

function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
    lines.push(step.output || step.error || '(no output)');
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  downloadMarkdown(`pipeline-${Date.now()}.md`, lines.join('\n'));
}

function downloadScheduleRun(run, scheduleName) {
  const lines = [
    `# Scheduled Pipeline Run — ${scheduleName}`,
    `**Status:** ${run.status}`,
    `**Started:** ${new Date(run.startedAt).toLocaleString()}`,
    `**Completed:** ${new Date(run.completedAt).toLocaleString()}`,
    '',
    '---',
    '',
  ];
  for (const r of run.results) {
    lines.push(`## ${r.agentEmoji} ${r.agentName}`);
    lines.push('');
    if (r.error) lines.push(`⚠ Error: ${r.error}`);
    else lines.push(r.output || '(no output)');
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  downloadMarkdown(`scheduled-run-${run.id}.md`, lines.join('\n'));
}

const INTERVALS = [
  { label: 'Every hour',    cron: '0 * * * *' },
  { label: 'Every 4 hours', cron: '0 */4 * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Every 12 hours',cron: '0 */12 * * *' },
  { label: 'Daily at time', cron: null },
];

// ── Schedule Panel ─────────────────────────────────────────────────────────────
function SchedulePanel({ pipeline, input, apiKey, model }) {
  const [schedules, setSchedules]       = useState([]);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState('');

  const [schedName, setSchedName]       = useState('');
  const [intervalIdx, setIntervalIdx]   = useState(0);
  const [dailyTime, setDailyTime]       = useState('09:00');
  const [showForm, setShowForm]         = useState(false);

  const [expandedRuns, setExpandedRuns] = useState({});
  const [runs, setRuns]                 = useState({});

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/schedules');
      setSchedules(await res.json());
    } catch { setError('Failed to load schedules'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const buildCron = () => {
    const chosen = INTERVALS[intervalIdx];
    if (chosen.cron) return chosen.cron;
    const [hh, mm] = dailyTime.split(':').map(Number);
    return `${mm} ${hh} * * *`;
  };

  const buildIntervalLabel = () => {
    const chosen = INTERVALS[intervalIdx];
    if (chosen.cron) return chosen.label;
    return `Daily at ${dailyTime}`;
  };

  const saveSchedule = async () => {
    if (!schedName.trim()) { setError('Give this schedule a name.'); return; }
    if (!pipeline.length)  { setError('Add agents to the pipeline first.'); return; }
    if (!apiKey)           { setError('API key required.'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: schedName.trim(),
          pipeline,
          initialInput: input,
          apiKey,
          model,
          cronExpr: buildCron(),
          intervalLabel: buildIntervalLabel(),
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Save failed'); }
      else { setSuccess('Schedule saved!'); setSchedName(''); setShowForm(false); fetchSchedules(); }
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deleteSchedule = async (id) => {
    await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    fetchSchedules();
  };

  const toggleSchedule = async (id) => {
    await fetch(`/api/schedules/${id}/toggle`, { method: 'PATCH' });
    fetchSchedules();
  };

  const runNow = async (id) => {
    await fetch(`/api/schedules/${id}/run`, { method: 'POST' });
    fetchSchedules();
  };

  const loadRuns = async (id) => {
    const toggled = { ...expandedRuns, [id]: !expandedRuns[id] };
    setExpandedRuns(toggled);
    if (toggled[id]) {
      const res = await fetch(`/api/schedules/${id}/runs`);
      setRuns(r => ({ ...r, [id]: (res.ok ? await res.json() : []) }));
    }
  };

  return (
    <div className="schedule-panel">
      <div className="schedule-panel-header">
        <Clock size={12} />
        <span>Scheduled Runs</span>
        <button className="pipeline-add-btn" style={{ marginLeft: 'auto', padding: '2px 8px', marginTop: 0 }}
          onClick={() => setShowForm(s => !s)}>
          <Plus size={10} /> New
        </button>
      </div>

      {showForm && (
        <div className="schedule-form">
          <input className="pipeline-search" placeholder="Schedule name"
            value={schedName} onChange={e => setSchedName(e.target.value)} />
          <div className="schedule-interval-row">
            {INTERVALS.map((iv, i) => (
              <button key={i} className={`schedule-interval-btn ${intervalIdx === i ? 'active' : ''}`}
                onClick={() => setIntervalIdx(i)}>
                {iv.label}
              </button>
            ))}
          </div>
          {INTERVALS[intervalIdx].cron === null && (
            <input type="time" className="pipeline-search" value={dailyTime}
              onChange={e => setDailyTime(e.target.value)} />
          )}
          <button className="pipeline-export-btn" onClick={saveSchedule} disabled={saving}>
            {saving ? <Loader size={11} className="spin" /> : <Clock size={11} />}
            Save Schedule
          </button>
        </div>
      )}

      {error   && <div className="schedule-error">{error}</div>}
      {success && <div className="schedule-success">{success}</div>}

      {loading ? (
        <div className="pipeline-empty">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div className="pipeline-empty">No schedules yet. Create one above.</div>
      ) : schedules.map(s => (
        <div key={s.id} className="schedule-item">
          <div className="schedule-item-header">
            <span className="schedule-item-name">{s.name}</span>
            <span className="schedule-item-interval">{s.intervalLabel || s.cron}</span>
            <button className="pipeline-remove-btn" title={s.active ? 'Pause' : 'Resume'}
              onClick={() => toggleSchedule(s.id)} style={{ color: s.active ? '#00ff88' : '#6a2020' }}>
              {s.active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
            </button>
            <button className="pipeline-remove-btn" title="Run now" onClick={() => runNow(s.id)}>
              <Play size={11} />
            </button>
            <button className="pipeline-remove-btn" title="View runs" onClick={() => loadRuns(s.id)}>
              {expandedRuns[s.id] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button className="pipeline-remove-btn" onClick={() => deleteSchedule(s.id)}>
              <Trash2 size={11} />
            </button>
          </div>
          {s.lastRun && (
            <div className="schedule-item-meta">Last run: {new Date(s.lastRun).toLocaleString()}</div>
          )}
          {expandedRuns[s.id] && (
            <div className="schedule-runs">
              {(runs[s.id] || []).length === 0 ? (
                <div className="pipeline-empty" style={{ padding: 6 }}>No runs yet.</div>
              ) : (runs[s.id] || []).map(run => (
                <div key={run.id} className={`schedule-run ${run.status}`}>
                  <div className="schedule-run-header">
                    <span className={`pipeline-result-badge ${run.status}`}>{run.status}</span>
                    <span className="schedule-run-date">{new Date(run.startedAt).toLocaleString()}</span>
                    <button className="pipeline-remove-btn" title="Download"
                      onClick={() => downloadScheduleRun(run, s.name)}>
                      <Download size={10} />
                    </button>
                  </div>
                  {run.results?.map((r, ri) => (
                    <div key={ri} className="schedule-run-step">
                      <span>{r.agentEmoji} {r.agentName}</span>
                      <span className="schedule-run-step-out">
                        {r.error ? `Error: ${r.error}` : (r.output || '').slice(0, 80)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Pipeline Builder ─────────────────────────────────────────────────────
export default function PipelineBuilder({ agents }) {
  const [pipeline, setPipeline]         = useState([]);
  const [savedPipelines, setSavedPipelines] = useState(() => loadSavedPipelines());
  const [activePipelineId, setActivePipelineId] = useState('');
  const [pipelineName, setPipelineName] = useState('Untitled pipeline');
  const [input, setInput]               = useState('');
  const [running, setRunning]           = useState(false);
  const [results, setResults]           = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey]             = useState(() => sanitizeHeaderValue(localStorage.getItem(LS_KEY) || ''));
  const [keyInput, setKeyInput]         = useState('');
  const [schedulerToken, setSchedulerToken] = useState(() => sanitizeHeaderValue(localStorage.getItem(LS_SCHEDULER_TOKEN) || ''));
  const [schedulerTokenInput, setSchedulerTokenInput] = useState('');
  const [model, setModel]               = useState(() => normalizeFreeModel(localStorage.getItem(LS_MDL) || FREE_MODELS[0].id));
  const [searchQ, setSearchQ]           = useState('');
  const [showPicker, setShowPicker]     = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState(new Set());

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]       = useState('');
  const [chatLoading, setChatLoading]   = useState(false);
  const [chatError, setChatError]       = useState('');
  const [chatErrorCode, setChatErrorCode] = useState('');

  const bottomRef    = useRef(null);
  const chatInputRef = useRef(null);

  const pipelineDone = results.length > 0 && results.every(r => r.status !== 'running');
  const lastResult   = results[results.length - 1];
  const lastAgent    = pipeline[pipeline.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results, chatMessages, chatLoading]);

  useEffect(() => {
    localStorage.setItem(LS_PIPELINES, JSON.stringify(savedPipelines));
  }, [savedPipelines]);

  const saveKey = () => { const k = sanitizeHeaderValue(keyInput); if (!k) return; localStorage.setItem(LS_KEY, k); setApiKey(k); setKeyInput(''); setShowSettings(false); };
  const saveSchedulerToken = () => {
    const token = sanitizeHeaderValue(schedulerTokenInput);
    localStorage.setItem(LS_SCHEDULER_TOKEN, token);
    setSchedulerToken(token);
    setSchedulerTokenInput('');
  };
  const saveModel = (m) => { const freeModel = normalizeFreeModel(m); setModel(freeModel); localStorage.setItem(LS_MDL, freeModel); };

  const addAgent    = (agent) => { setPipeline(p => [...p, { ...agent, ...defaultStepConfig() }]); setShowPicker(false); setSearchQ(''); };
  const removeAgent = (idx) => {
    setPipeline(p => p.filter((_, i) => i !== idx));
    setExpandedSteps(prev => { const next = new Set(prev); next.delete(idx); return next; });
  };
  const updateStepField = (idx, field, value) => {
    setPipeline(p => p.map((step, i) => i === idx ? { ...step, [field]: value } : step));
  };
  const toggleStepExpand = (idx) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const newPipeline = () => {
    setPipeline([]);
    setInput('');
    setResults([]);
    setChatMessages([]);
    setActivePipelineId('');
    setPipelineName('Untitled pipeline');
    setExpandedSteps(new Set());
  };

  const saveCurrentPipeline = () => {
    if (!pipeline.length) return;
    const id = activePipelineId || `pipeline-${Date.now()}`;
    const record = {
      id,
      name: pipelineName.trim() || 'Untitled pipeline',
      agentIds: pipeline.map(s => s.id),
      steps: pipeline.map(s => ({
        agentId: s.id,
        stepPrompt: s.stepPrompt || '',
        inputInstruction: s.inputInstruction || '',
        outputInstruction: s.outputInstruction || '',
      })),
      input,
      updatedAt: new Date().toISOString(),
    };
    setSavedPipelines(items => [record, ...items.filter(item => item.id !== id)]);
    setActivePipelineId(id);
  };

  const loadPipeline = (id) => {
    const saved = savedPipelines.find(item => item.id === id);
    if (!saved) return;
    setActivePipelineId(saved.id);
    setPipelineName(saved.name);
    if (saved.steps) {
      setPipeline(saved.steps.map(s => {
        const agent = agents.find(a => a.id === s.agentId);
        return agent ? { ...agent, stepPrompt: s.stepPrompt || '', inputInstruction: s.inputInstruction || '', outputInstruction: s.outputInstruction || '' } : null;
      }).filter(Boolean));
    } else {
      setPipeline((saved.agentIds || []).map(agentId => {
        const agent = agents.find(a => a.id === agentId);
        return agent ? { ...agent, ...defaultStepConfig() } : null;
      }).filter(Boolean));
    }
    setInput(saved.input || '');
    setResults([]);
    setChatMessages([]);
    setChatError('');
    setExpandedSteps(new Set());
  };

  const deletePipeline = (id) => {
    setSavedPipelines(items => items.filter(item => item.id !== id));
    if (activePipelineId === id) newPipeline();
  };

  const runPipeline = useCallback(async () => {
    const cleanApiKey = sanitizeHeaderValue(apiKey);
    const cleanSchedulerToken = sanitizeHeaderValue(schedulerToken);
    if (!pipeline.length || !input.trim() || !cleanApiKey) return;
    if (cleanApiKey !== apiKey) { localStorage.setItem(LS_KEY, cleanApiKey); setApiKey(cleanApiKey); }
    if (cleanSchedulerToken !== schedulerToken) { localStorage.setItem(LS_SCHEDULER_TOKEN, cleanSchedulerToken); setSchedulerToken(cleanSchedulerToken); }
    setRunning(true);
    setResults([]);
    setChatMessages([]);
    setChatError('');

    let currentInput = input.trim();

    for (let i = 0; i < pipeline.length; i++) {
      const step = pipeline[i];
      const prevStep = i > 0 ? pipeline[i - 1] : null;
      setResults(r => [...r, { agent: step, status: 'running', output: '' }]);

      try {
        let userContent;
        if (i === 0) {
          userContent = step.inputInstruction
            ? `${step.inputInstruction}\n\n${currentInput}`
            : currentInput;
        } else {
          userContent = step.inputInstruction
            ? `${step.inputInstruction}\n\nOutput from ${prevStep.name}:\n\n${currentInput}`
            : `Output from ${prevStep.name}:\n\n${currentInput}\n\nProcess this according to your role.`;
        }

        const extraInstructions = [
          step.stepPrompt,
          step.outputInstruction ? `Format your output as follows: ${step.outputInstruction}` : '',
        ].filter(Boolean).join('\n\n');

        const data = await callAgent(step, [{ role: 'user', content: userContent }], cleanApiKey, model, cleanSchedulerToken, extraInstructions);
        if (data.error) throw new Error(data.error);

        const output = data.choices?.[0]?.message?.content || '(no output)';
        currentInput = output;
        setResults(r => r.map((s, idx) => idx === i ? { ...s, status: 'done', output } : s));
      } catch (e) {
        setResults(r => r.map((s, idx) => idx === i ? { ...s, status: 'error', output: e.message } : s));
        break;
      }
    }

    setRunning(false);
  }, [pipeline, input, apiKey, model, schedulerToken]);

  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim();
    const cleanApiKey = sanitizeHeaderValue(apiKey);
    const cleanSchedulerToken = sanitizeHeaderValue(schedulerToken);
    if (!text || chatLoading || !cleanApiKey || !lastAgent) return;
    if (cleanApiKey !== apiKey) { localStorage.setItem(LS_KEY, cleanApiKey); setApiKey(cleanApiKey); }
    if (cleanSchedulerToken !== schedulerToken) { localStorage.setItem(LS_SCHEDULER_TOKEN, cleanSchedulerToken); setSchedulerToken(cleanSchedulerToken); }
    setChatInput('');
    setChatError('');
    setChatErrorCode('');

    const pipelineContext = results
      .filter(r => r.status === 'done')
      .map(r => `[${r.agent.name}]: ${r.output}`)
      .join('\n\n---\n\n');

    const userMsg = { role: 'user', content: text };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setChatLoading(true);

    const systemWithContext = buildSystemPrompt(lastAgent) +
      `\n\n---\n\nFULL PIPELINE OUTPUT (from previous agents in this session):\n\n${pipelineContext}`;

    try {
      const headers = { 'Content-Type': 'application/json', 'x-openrouter-key': cleanApiKey };
      if (cleanSchedulerToken) headers['x-scheduler-token'] = cleanSchedulerToken;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'system', content: systemWithContext }, ...history],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error || `Error ${res.status}`);
        setChatErrorCode(data.code || '');
      } else {
        const reply = data.choices?.[0]?.message?.content || '(no response)';
        setChatMessages([...history, { role: 'assistant', content: reply }]);
      }
    } catch (e) {
      setChatError(e.message);
      setChatErrorCode('NETWORK_ERROR');
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, apiKey, model, chatMessages, lastAgent, results, schedulerToken]);

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
            <div className="chat-settings-row" style={{ marginTop: 8 }}><Key size={11} /><span>Scheduler Token</span></div>
            <div className="chat-settings-keyrow">
              <input className="chat-key-input" type="password"
                placeholder={schedulerToken ? '••••••••••••••••' : 'Optional scheduler auth token'}
                value={schedulerTokenInput} onChange={e => setSchedulerTokenInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveSchedulerToken()} />
              <button className="chat-save-btn" onClick={saveSchedulerToken}>Save</button>
            </div>
            <div className="chat-settings-row" style={{ marginTop: 8 }}><Bot size={11} /><span>Free Model</span><a href={OPENROUTER_FREE_MODELS_URL} target="_blank" rel="noreferrer" className="chat-settings-link">OpenRouter free list</a></div>
            <div className="chat-model-list">
              {FREE_MODELS.map(m => (
                <button key={m.id} className={`chat-model-btn ${model === m.id ? 'active' : ''}`} onClick={() => saveModel(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pipeline-manager">
          <div className="pipeline-settings-keyrow">
            <input
              className="pipeline-search"
              placeholder="Pipeline name"
              value={pipelineName}
              onChange={e => setPipelineName(e.target.value)}
            />
          </div>
          <div className="pipeline-run-row">
            <button className="pipeline-export-btn" onClick={saveCurrentPipeline} disabled={!pipeline.length}>
              Save Pipeline
            </button>
            <button className="pipeline-export-btn" onClick={newPipeline}>
              New
            </button>
          </div>
          {savedPipelines.length > 0 && (
            <div className="pipeline-picker-list" style={{ maxHeight: 150, marginTop: 8 }}>
              {savedPipelines.map(saved => (
                <div key={saved.id} className={`pipeline-pick-item ${activePipelineId === saved.id ? 'active' : ''}`}>
                  <button className="pipeline-saved-load" onClick={() => loadPipeline(saved.id)}>
                    <span>{saved.agentIds.length}</span>
                    <div>
                      <div className="pipeline-pick-name">{saved.name}</div>
                      <div className="pipeline-pick-div">{saved.agentIds.length} agent{saved.agentIds.length !== 1 ? 's' : ''}</div>
                    </div>
                  </button>
                  <button className="pipeline-remove-btn" onClick={() => deletePipeline(saved.id)}><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pipeline-stages">
          {pipeline.length === 0 && (
            <div className="pipeline-empty">Add agents below to build a pipeline</div>
          )}
          {pipeline.map((step, i) => (
            <React.Fragment key={`${step.id}-${i}`}>
              <div className="pipeline-stage">
                <div className="pipeline-stage-num">{i + 1}</div>
                <span className="pipeline-stage-emoji">{step.emoji}</span>
                <div className="pipeline-stage-info">
                  <div className="pipeline-stage-name">{step.name}</div>
                  <div className="pipeline-stage-div" style={{ color: step.divisionColor }}>{step.divisionLabel}</div>
                </div>
                <button
                  className={`pipeline-step-cfg-btn${expandedSteps.has(i) ? ' active' : ''}`}
                  onClick={() => toggleStepExpand(i)}
                  title="Configure step prompt & I/O"
                >
                  <Settings size={10} />
                </button>
                <button className="pipeline-remove-btn" onClick={() => removeAgent(i)}><X size={11} /></button>
              </div>
              {expandedSteps.has(i) && (
                <div className="pipeline-step-config">
                  <div className="pipeline-step-config-field">
                    <label className="pipeline-step-config-label">Step instructions</label>
                    <textarea
                      className="pipeline-step-config-ta"
                      placeholder="Custom additions to this agent's system prompt for this step. E.g. 'Focus only on sentiment analysis — ignore off-topic content.'"
                      value={step.stepPrompt}
                      onChange={e => updateStepField(i, 'stepPrompt', e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="pipeline-step-config-field">
                    <label className="pipeline-step-config-label">
                      {i === 0
                        ? 'Input framing (prepended to initial prompt)'
                        : `Input handling — output from step ${i}: ${pipeline[i - 1].name}`}
                    </label>
                    <textarea
                      className="pipeline-step-config-ta"
                      placeholder={i === 0
                        ? 'E.g. "You will receive raw meeting notes. Extract all action items from them."'
                        : 'E.g. "The previous agent extracted key entities. Now classify each entity by type and assign a confidence score."'
                      }
                      value={step.inputInstruction}
                      onChange={e => updateStepField(i, 'inputInstruction', e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="pipeline-step-config-field">
                    <label className="pipeline-step-config-label">
                      {i === pipeline.length - 1 ? 'Final output format' : 'Output format for next step'}
                    </label>
                    <textarea
                      className="pipeline-step-config-ta"
                      placeholder={i === pipeline.length - 1
                        ? 'E.g. "Return a JSON object with keys: summary (str), actions (list), confidence (0–1)."'
                        : 'E.g. "Produce a numbered list — one item per line — so the next agent can process each item individually."'
                      }
                      value={step.outputInstruction}
                      onChange={e => updateStepField(i, 'outputInstruction', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}
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

        <button
          className="pipeline-schedule-toggle"
          onClick={() => setShowSchedule(s => !s)}
        >
          <Clock size={11} />
          {showSchedule ? 'Hide Schedule' : 'Schedule Pipeline'}
          {showSchedule ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {showSchedule && (
          <SchedulePanel pipeline={pipeline} input={input} apiKey={apiKey} model={model} />
        )}
      </div>

      {/* Right: run + results + interactive chat */}
      <div className="pipeline-right">
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
              <button
                className="pipeline-run-btn"
                onClick={runPipeline}
                disabled={running || !pipeline.length || !input.trim()}
              >
                {running ? <Loader size={13} className="spin" /> : <Play size={13} />}
                {running ? 'Running...' : `Run ${pipeline.length} Agent${pipeline.length !== 1 ? 's' : ''}`}
              </button>
              {results.length > 0 && !running && (
                <button
                  className="pipeline-export-btn"
                  title="Download all results as markdown"
                  onClick={() => downloadPipelineResults(pipeline, results, input)}
                >
                  <Download size={13} /> Export All
                </button>
              )}
            </div>

            {!pipeline.length && (
              <div className="pipeline-hint">
                Add agents in the left panel to build your pipeline.
              </div>
            )}
            {pipeline.length > 0 && !input.trim() && (
              <div className="pipeline-hint">
                Uses current pipeline ({pipeline.length} agent{pipeline.length !== 1 ? 's' : ''}) and prompt above.
              </div>
            )}
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
                  {step.status === 'done' && step.output && (
                    <button
                      className="pipeline-step-dl-btn"
                      title={`Download ${step.agent.name} output`}
                      onClick={() => downloadMarkdown(
                        `${step.agent.slug || step.agent.name.toLowerCase().replace(/\s+/g,'-')}-output-${Date.now()}.md`,
                        `# ${step.agent.emoji} ${step.agent.name} Output\n\n${step.output}`
                      )}
                    >
                      <Download size={9} />
                    </button>
                  )}
                </div>
                {(step.output || step.status === 'error') && (
                  <div className="pipeline-result-body">
                    {step.status === 'error'
                      ? <ErrorBanner msg={step.output} compact />
                      : step.output}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Interactive follow-up chat with final agent */}
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
              {chatError && (
                <ErrorBanner
                  msg={chatError}
                  code={chatErrorCode}
                  onDismiss={() => { setChatError(''); setChatErrorCode(''); }}
                />
              )}
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
              <button
                className="chat-send-btn"
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || chatLoading}
              >
                {chatLoading ? <Loader size={13} className="spin" /> : <Send size={13} />}
              </button>
            </div>
            <div className="chat-footer-model">
              <Bot size={9} /> {modelLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
