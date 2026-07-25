import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { spawn } from 'child_process';
import cron from 'node-cron';

// ElevenLabs voice ID
const ELEVENLABS_VOICE_ID = 'Vs5CmVCVJwW4odQS2pVf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Broadcast to all WS clients
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// Parse agent divisions from divisions.json
const divisionsRaw = JSON.parse(fs.readFileSync(path.join(__dirname, 'divisions.json'), 'utf8'));
const DIVISIONS = divisionsRaw.divisions;

const DIVISION_DIRS = Object.keys(DIVISIONS);

// Read all agents
function loadAgents() {
  const agents = [];
  for (const div of DIVISION_DIRS) {
    const divPath = path.join(__dirname, div);
    if (!fs.existsSync(divPath)) continue;
    const files = fs.readdirSync(divPath).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(divPath, file), 'utf8');
        const parsed = matter(raw);
        const slug = file.replace('.md', '');
        agents.push({
          id: `${div}/${slug}`,
          slug,
          division: div,
          divisionLabel: DIVISIONS[div]?.label || div,
          divisionColor: DIVISIONS[div]?.color || '#dc2626',
          name: parsed.data.name || slug,
          description: parsed.data.description || '',
          color: parsed.data.color || '',
          emoji: parsed.data.emoji || '🤖',
          vibe: parsed.data.vibe || '',
          content: parsed.content,
        });
      } catch (e) {
        // skip broken files
      }
    }
  }
  return agents;
}

let agentsCache = null;
function getAgents() {
  if (!agentsCache) agentsCache = loadAgents();
  return agentsCache;
}

// Routes
app.get('/api/agents', (req, res) => {
  const { search, division } = req.query;
  let agents = getAgents();
  if (division) agents = agents.filter(a => a.division === division);
  if (search) {
    const q = search.toLowerCase();
    agents = agents.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.vibe.toLowerCase().includes(q) ||
      a.division.toLowerCase().includes(q)
    );
  }
  res.json(agents);
});

app.get('/api/agents/:division/:slug', (req, res) => {
  const { division, slug } = req.params;
  const agents = getAgents();
  const agent = agents.find(a => a.division === division && a.slug === slug);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json(agent);
});

app.get('/api/divisions', (req, res) => {
  const agents = getAgents();
  const counts = {};
  for (const a of agents) counts[a.division] = (counts[a.division] || 0) + 1;
  const result = Object.entries(DIVISIONS).map(([id, info]) => ({
    id,
    ...info,
    count: counts[id] || 0,
  }));
  res.json(result);
});

app.get('/api/stats', (req, res) => {
  const agents = getAgents();
  res.json({
    total: agents.length,
    divisions: Object.keys(DIVISIONS).length,
  });
});

// ── ElevenLabs TTS proxy ───────────────────────────────────────────────────────
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'No ElevenLabs API key configured' });

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.52,
            similarity_boost: 0.88,
            style: 0.60,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    const buf = await response.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Real activity log ──────────────────────────────────────────────────────────
// Tracks genuine user interactions: agent views, briefings, searches.
const activityLog = [];

app.post('/api/activity', (req, res) => {
  const { agentId, agentName, agentEmoji, division, divisionColor, action } = req.body;
  if (!agentName || !action) return res.status(400).json({ error: 'Missing fields' });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const entry = {
    id,
    agentId: agentId || 'unknown',
    agentName,
    agentEmoji: agentEmoji || '🤖',
    division: division || 'unknown',
    divisionColor: divisionColor || '#dc2626',
    action,
    status: 'done',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    result: null,
  };

  activityLog.unshift(entry);
  if (activityLog.length > 100) activityLog.length = 100;

  broadcast({ type: 'agent_done', entry });
  res.json({ ok: true });
});

app.get('/api/activities', (req, res) => {
  res.json(activityLog.slice(0, 40));
});

// 24-hour activity stats
app.get('/api/stats/24h', (req, res) => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = activityLog.filter(e => new Date(e.startedAt).getTime() > cutoff);

  // Count by division
  const divMap = {};
  for (const e of recent) {
    const key = e.division;
    if (!divMap[key]) divMap[key] = { id: key, label: DIVISIONS[key]?.label || key, color: DIVISIONS[key]?.color || '#dc2626', count: 0 };
    divMap[key].count++;
  }
  const byDivision = Object.values(divMap).sort((a, b) => b.count - a.count);

  // Top agents
  const agentMap = {};
  for (const e of recent) {
    if (!agentMap[e.agentId]) agentMap[e.agentId] = { agentId: e.agentId, agentName: e.agentName, agentEmoji: e.agentEmoji || '🤖', count: 0 };
    agentMap[e.agentId].count++;
  }
  const topAgents = Object.values(agentMap).sort((a, b) => b.count - a.count).slice(0, 8);

  // By hour (last 24h, bucketed)
  const hourBuckets = {};
  for (let h = 0; h < 24; h++) hourBuckets[h] = 0;
  for (const e of recent) {
    const h = new Date(e.startedAt).getHours();
    hourBuckets[h] = (hourBuckets[h] || 0) + 1;
  }
  const byHour = Object.entries(hourBuckets).map(([hour, count]) => ({ hour: Number(hour), count }));

  res.json({ total: recent.length, byDivision, topAgents, byHour });
});

// ── Single-agent install — streams output via WebSocket ───────────────────────
app.post('/api/install/agent', (req, res) => {
  const { division, slug, tools: toolList } = req.body;
  if (!division || !slug || !Array.isArray(toolList) || toolList.length === 0) {
    return res.status(400).json({ error: 'division, slug, and tools[] required' });
  }

  res.json({ ok: true, message: `Installing ${slug} to ${toolList.join(', ')}` });
  const repoRoot = __dirname;
  const agentArg = `${division}/${slug}`;

  broadcast({ type: 'install_start', tool: 'agent', agentId: agentArg });

  const convert = spawn('bash', ['scripts/convert.sh'], { cwd: repoRoot, env: { ...process.env } });
  convert.stdout.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
  convert.stderr.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
  convert.on('close', code => {
    if (code !== 0) { broadcast({ type: 'install_error', text: `convert.sh exited ${code}` }); return; }
    broadcast({ type: 'install_log', text: '\n[convert complete] Installing agent...\n' });

    const toolArgs = [];
    toolList.forEach(t => { toolArgs.push('--tool'); toolArgs.push(t); });

    const install = spawn('bash', [
      'scripts/install.sh',
      '--agent', slug,
      ...toolArgs,
      '--no-interactive',
    ], { cwd: repoRoot, env: { ...process.env } });

    install.stdout.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
    install.stderr.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
    install.on('close', code2 => {
      broadcast({ type: 'install_done', exitCode: code2, agentId: agentArg });
    });
  });
});

// ── OpenRouter chat proxy ──────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const apiKey = req.headers['x-openrouter-key'];
  if (!apiKey) return res.status(401).json({ error: 'Provide x-openrouter-key header' });

  const { messages, model = 'meta-llama/llama-3.3-70b-instruct:free', stream = false } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' });

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://the-agency.replit.app',
        'X-Title': 'The Agency — Ultron Protocol',
      },
      body: JSON.stringify({ model, messages, stream }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      let errMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errJson.error || errJson.message || errText;
      } catch { /* keep raw text */ }
      return res.status(upstream.status).json({ error: errMsg });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      upstream.body.pipe(res);
    } else {
      const data = await upstream.json();
      res.json(data);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Scheduler Security ─────────────────────────────────────────────────────────
// Random per-process token: changes on every server restart.
// Frontend fetches it once on init; all scheduler routes require it.
const SCHEDULER_TOKEN = crypto.randomBytes(32).toString('hex');

// Derive a 32-byte AES key from SESSION_SECRET so stored API keys are encrypted
// at rest and useless without the server's secret.
const _rawSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ENC_KEY = crypto.createHash('sha256').update(_rawSecret).digest();

function encryptApiKey(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptApiKey(ciphertext) {
  try {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch { return null; }
}

// Middleware: all scheduler routes require the per-process token
function requireSchedulerAuth(req, res, next) {
  const token = req.headers['x-scheduler-token'];
  if (!token || token.length !== SCHEDULER_TOKEN.length) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (!crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(SCHEDULER_TOKEN, 'hex'))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch { return res.status(401).json({ error: 'Unauthorized' }); }
  next();
}

// Frontend calls this once on init — returns the per-process token so the browser
// can authenticate subsequent scheduler operations.
app.get('/api/scheduler-token', (req, res) => {
  res.json({ token: SCHEDULER_TOKEN });
});

// ── Pipeline Scheduler ─────────────────────────────────────────────────────────
const SCHEDULES_FILE = path.join(__dirname, '.agency-schedules.json');
const SAVED_PIPELINES_FILE = path.join(__dirname, '.agency-saved-pipelines.json');
const cronJobs = new Map(); // id -> cron task

function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
  } catch { /* start fresh */ }
  return [];
}
function saveSchedules(schedules) {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

function loadSavedPipelines() {
  try {
    if (fs.existsSync(SAVED_PIPELINES_FILE)) return JSON.parse(fs.readFileSync(SAVED_PIPELINES_FILE, 'utf8'));
  } catch { /* start fresh */ }
  return [];
}
function saveSavedPipelines(pipelines) {
  fs.writeFileSync(SAVED_PIPELINES_FILE, JSON.stringify(pipelines, null, 2));
}

async function runScheduledPipeline(schedule) {
  const { id, pipeline, initialInput, encryptedApiKey, model } = schedule;
  const apiKey = decryptApiKey(encryptedApiKey);
  if (!apiKey) {
    broadcast({ type: 'schedule_run_done', scheduleId: id, status: 'error', name: schedule.name, completedAt: new Date().toISOString() });
    return;
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = new Date().toISOString();
  broadcast({ type: 'schedule_run_start', scheduleId: id, runId, name: schedule.name });

  const results = [];
  let currentInput = initialInput;
  let runStatus = 'done';

  for (let i = 0; i < pipeline.length; i++) {
    const agent = pipeline[i];
    try {
      const userContent = i === 0
        ? currentInput
        : `Previous agent output:\n\n${currentInput}\n\nContinue processing this according to your role.`;

      const systemPrompt = `You are ${agent.name}, a specialized AI agent in The Agency.\nDivision: ${agent.divisionLabel}\n${agent.description ? `Description: ${agent.description}` : ''}\n\nYour full specification:\n---\n${agent.content}`;

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://the-agency.replit.app',
          'X-Title': 'The Agency — Scheduled Pipeline',
        },
        body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }] }),
      });

      const data = await resp.json();
      if (!resp.ok || data.error) {
        const errMsg = data.error?.message || data.error || `HTTP ${resp.status}`;
        results.push({ agentName: agent.name, agentEmoji: agent.emoji, output: null, error: errMsg });
        runStatus = 'error'; break;
      }
      const output = data.choices?.[0]?.message?.content || '(no output)';
      currentInput = output;
      results.push({ agentName: agent.name, agentEmoji: agent.emoji, output });
    } catch (e) {
      results.push({ agentName: agent.name, agentEmoji: agent.emoji, output: null, error: e.message });
      runStatus = 'error'; break;
    }
  }

  const run = { id: runId, startedAt, completedAt: new Date().toISOString(), status: runStatus, results };
  const schedules = loadSchedules();
  const idx = schedules.findIndex(s => s.id === id);
  if (idx !== -1) {
    schedules[idx].lastRunAt = run.completedAt;
    schedules[idx].lastRunStatus = runStatus;
    schedules[idx].runs = [run, ...(schedules[idx].runs || [])].slice(0, 10);
    saveSchedules(schedules);
  }
  broadcast({ type: 'schedule_run_done', scheduleId: id, runId, status: runStatus, name: schedule.name, completedAt: run.completedAt });
  return run;
}

function startScheduleJob(schedule) {
  if (!schedule.enabled) return;
  if (cronJobs.has(schedule.id)) cronJobs.get(schedule.id).stop();
  if (!cron.validate(schedule.cronExpr)) return;
  const task = cron.schedule(schedule.cronExpr, () => {
    const fresh = loadSchedules().find(s => s.id === schedule.id);
    if (fresh && fresh.enabled) runScheduledPipeline(fresh);
  }, { timezone: 'UTC' });
  cronJobs.set(schedule.id, task);
}

// ── Saved Pipelines (named configs, no scheduling) ────────────────────────────
app.get('/api/saved-pipelines', requireSchedulerAuth, (req, res) => {
  res.json(loadSavedPipelines().map(p => ({
    ...p,
    pipeline: p.pipeline.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, divisionLabel: a.divisionLabel, divisionColor: a.divisionColor })),
  })));
});

app.post('/api/saved-pipelines', requireSchedulerAuth, (req, res) => {
  const { name, pipeline, initialInput } = req.body;
  if (!name || !pipeline?.length) return res.status(400).json({ error: 'name and pipeline required' });
  const id = `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const saved = loadSavedPipelines();
  saved.push({ id, name, pipeline, initialInput: initialInput || '', createdAt: new Date().toISOString() });
  saveSavedPipelines(saved);
  res.json({ ok: true, id });
});

app.delete('/api/saved-pipelines/:id', requireSchedulerAuth, (req, res) => {
  const saved = loadSavedPipelines().filter(p => p.id !== req.params.id);
  saveSavedPipelines(saved);
  res.json({ ok: true });
});

// ── Schedule CRUD (all protected) ─────────────────────────────────────────────
app.get('/api/schedules', requireSchedulerAuth, (req, res) => {
  res.json(loadSchedules().map(s => ({
    ...s,
    encryptedApiKey: undefined,     // never expose the encrypted blob
    hasKey: !!s.encryptedApiKey,    // just tell the frontend whether a key is stored
    pipeline: s.pipeline.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, divisionLabel: a.divisionLabel, divisionColor: a.divisionColor })),
  })));
});

app.post('/api/schedules', requireSchedulerAuth, (req, res) => {
  const { name, pipeline, initialInput, apiKey, model, cronExpr, intervalLabel } = req.body;
  if (!name || !pipeline?.length || !initialInput || !apiKey || !cronExpr)
    return res.status(400).json({ error: 'name, pipeline, initialInput, apiKey, cronExpr required' });
  if (!cron.validate(cronExpr)) return res.status(400).json({ error: 'Invalid cron expression' });

  const id = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const schedule = {
    id, name,
    pipeline,
    initialInput,
    encryptedApiKey: encryptApiKey(apiKey),   // store encrypted, not plaintext
    model: model || 'meta-llama/llama-3.3-70b-instruct:free',
    cronExpr, intervalLabel: intervalLabel || cronExpr,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRunAt: null, lastRunStatus: null, runs: [],
  };
  const schedules = loadSchedules();
  schedules.push(schedule);
  saveSchedules(schedules);
  startScheduleJob(schedule);
  res.json({ ok: true, id });
});

app.delete('/api/schedules/:id', requireSchedulerAuth, (req, res) => {
  const schedules = loadSchedules();
  const idx = schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  schedules.splice(idx, 1);
  saveSchedules(schedules);
  if (cronJobs.has(req.params.id)) { cronJobs.get(req.params.id).stop(); cronJobs.delete(req.params.id); }
  res.json({ ok: true });
});

app.patch('/api/schedules/:id/toggle', requireSchedulerAuth, (req, res) => {
  const schedules = loadSchedules();
  const idx = schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  schedules[idx].enabled = !schedules[idx].enabled;
  saveSchedules(schedules);
  if (schedules[idx].enabled) startScheduleJob(schedules[idx]);
  else { if (cronJobs.has(req.params.id)) { cronJobs.get(req.params.id).stop(); cronJobs.delete(req.params.id); } }
  res.json({ ok: true, enabled: schedules[idx].enabled });
});

app.post('/api/schedules/:id/run', requireSchedulerAuth, (req, res) => {
  const schedule = loadSchedules().find(s => s.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, message: 'Pipeline run started' });
  runScheduledPipeline(schedule);
});

// POST run ALL enabled schedules at once
app.post('/api/schedules/run-all', requireSchedulerAuth, (req, res) => {
  const enabled = loadSchedules().filter(s => s.enabled);
  res.json({ ok: true, count: enabled.length });
  for (const s of enabled) runScheduledPipeline(s);
});

app.get('/api/schedules/:id/runs', requireSchedulerAuth, (req, res) => {
  const schedule = loadSchedules().find(s => s.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  res.json(schedule.runs || []);
});

// Boot: load and start all enabled schedules
{
  const boot = loadSchedules();
  for (const s of boot) if (s.enabled) startScheduleJob(s);
  console.log(`Loaded ${boot.length} schedule(s).`);
}

// Run OpenClaw install — streams output via WebSocket
app.post('/api/install/openclaw', (req, res) => {
  res.json({ ok: true, message: 'OpenClaw installation started. Watch the terminal panel.' });

  const repoRoot = __dirname;

  broadcast({ type: 'install_start', tool: 'openclaw' });

  // Step 1: convert
  const convert = spawn('bash', ['scripts/convert.sh', '--tool', 'openclaw'], {
    cwd: repoRoot,
    env: { ...process.env, PATH: process.env.PATH }
  });

  convert.stdout.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
  convert.stderr.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));

  convert.on('close', code => {
    if (code !== 0) {
      broadcast({ type: 'install_error', text: `convert.sh exited with code ${code}` });
      return;
    }
    broadcast({ type: 'install_log', text: '\n[convert complete] Starting install...\n' });

    const install = spawn('bash', ['scripts/install.sh', '--tool', 'openclaw', '--no-interactive', '--path', path.join(repoRoot, '.openclaw/agency-agents')], {
      cwd: repoRoot,
      env: { ...process.env, PATH: process.env.PATH }
    });

    install.stdout.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
    install.stderr.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
    install.on('close', code2 => {
      broadcast({ type: 'install_done', exitCode: code2 });
    });
  });
});

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'ULTRON PROTOCOL ONLINE. All systems operational.'
  }));

  // Send current real activity log to newly connected client
  if (activityLog.length > 0) {
    ws.send(JSON.stringify({ type: 'activity_state', entries: activityLog.slice(0, 40) }));
  }
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`The Agency — Ultron Protocol running on port ${PORT}`);
});
