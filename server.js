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

// Strip any character outside printable ASCII (0x20-0x7E) — prevents ByteString
// errors when the value is later used in an HTTP header.
function sanitizeHeaderValue(value) {
  return String(value || '').replace(/[^\x20-\x7E]/g, '').trim();
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

// -- ElevenLabs TTS proxy ------------------------------------------------------
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'No ElevenLabs API key configured' });

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': sanitizeHeaderValue(apiKey),
          'Content-Type': 'application/json',
        },
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

// -- Real activity log ---------------------------------------------------------
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

  const byDivision = {};
  for (const e of recent) {
    byDivision[e.division] = (byDivision[e.division] || 0) + 1;
  }

  const agentCounts = {};
  for (const e of recent) {
    if (!agentCounts[e.agentName]) agentCounts[e.agentName] = { name: e.agentName, emoji: e.agentEmoji, count: 0 };
    agentCounts[e.agentName].count++;
  }
  const topAgents = Object.values(agentCounts).sort((a, b) => b.count - a.count).slice(0, 5);

  res.json({ total: recent.length, byDivision, topAgents });
});

// -- Scheduler Security --------------------------------------------------------
const SCHEDULER_TOKEN = crypto.randomBytes(32).toString('hex');

const _rawSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ENC_KEY = crypto.createHash('sha256').update(_rawSecret).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(data) {
  const [ivHex, encHex] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

app.get('/api/scheduler/token', (req, res) => {
  res.json({ token: SCHEDULER_TOKEN });
});

function requireSchedulerToken(req, res, next) {
  const token = req.headers['x-scheduler-token'];
  if (token !== SCHEDULER_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// In-memory schedule store
let schedules = [];

const SCHEDULES_FILE = path.join(__dirname, '.schedules.json');

function saveSchedules() {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      schedules = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
    }
  } catch {
    schedules = [];
  }
}

app.post('/api/scheduler/key', requireSchedulerToken, (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  const encrypted = encrypt(key);
  res.json({ encrypted });
});

app.get('/api/scheduler/schedules', requireSchedulerToken, (req, res) => {
  res.json(schedules.map(s => ({ ...s, encryptedKey: undefined })));
});

app.post('/api/scheduler/schedules', requireSchedulerToken, (req, res) => {
  const { name, cron: cronExpr, pipeline, model, initialInput, encryptedKey } = req.body;
  if (!name || !cronExpr || !pipeline || !encryptedKey) {
    return res.status(400).json({ error: 'name, cron, pipeline, encryptedKey required' });
  }
  if (!cron.validate(cronExpr)) return res.status(400).json({ error: 'Invalid cron expression' });

  const id = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const schedule = { id, name, cron: cronExpr, pipeline, model: model || 'meta-llama/llama-3.3-70b-instruct:free', initialInput: initialInput || '', encryptedKey, active: true, lastRun: null, nextRun: null };
  schedules.push(schedule);
  saveSchedules();
  registerCronJob(schedule);
  res.json({ ok: true, id });
});

app.delete('/api/scheduler/schedules/:id', requireSchedulerToken, (req, res) => {
  const { id } = req.params;
  const idx = schedules.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  schedules.splice(idx, 1);
  saveSchedules();
  const job = cronJobs.get(id);
  if (job) { job.stop(); cronJobs.delete(id); }
  res.json({ ok: true });
});

app.patch('/api/scheduler/schedules/:id/toggle', requireSchedulerToken, (req, res) => {
  const { id } = req.params;
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return res.status(404).json({ error: 'Not found' });
  schedule.active = !schedule.active;
  saveSchedules();
  const job = cronJobs.get(id);
  if (job) { if (schedule.active) job.start(); else job.stop(); }
  res.json({ ok: true, active: schedule.active });
});

// -- OpenRouter chat proxy -----------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const rawKey = req.headers['x-openrouter-key'];
  if (!rawKey) return res.status(401).json({ error: 'Provide x-openrouter-key header' });

  // Sanitize to ASCII-safe range — guards against non-Latin-1 chars that would
  // throw a ByteString error in Node.js fetch when set as a header value.
  const apiKey = sanitizeHeaderValue(rawKey);
  if (!apiKey) return res.status(401).json({ error: 'API key contains only invalid characters. Re-enter it in settings.' });

  const { messages, model = 'meta-llama/llama-3.3-70b-instruct:free', stream = false } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' });

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://the-agency.replit.app',
        'X-Title': 'The Agency - Ultron Protocol',
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
      const status = upstream.status;
      const code =
        status === 401 ? 'AUTH_FAILED' :
        status === 403 ? 'FORBIDDEN' :
        status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR';
      return res.status(status).json({ error: errMsg, code });
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

// -- Single-agent install - streams output via WebSocket -----------------------
app.post('/api/install', async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId required' });

  res.json({ ok: true });

  const agents = getAgents();
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return broadcast({ type: 'install_error', agentId, error: 'Agent not found' });

  broadcast({ type: 'install_start', agentId });
  const agentArg = `${agent.division}/${agent.slug}`;
  const toolList = ['npm', 'git', 'node', 'python'];

  const toolArgs = [];
  toolList.forEach(t => { toolArgs.push('--tool'); toolArgs.push(t); });

  const install = spawn('bash', ['scripts/install.sh',
    '--agent', agentArg,
    '--no-interactive',
    ...toolArgs,
  ]);

  install.stdout.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
  install.stderr.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
  install.on('close', code2 => {
    broadcast({ type: 'install_done', exitCode: code2, agentId: agentArg });
  });
});

// -- Cron job registry ---------------------------------------------------------
const cronJobs = new Map();

async function runSchedule(schedule) {
  const { id, name, pipeline, model, initialInput, encryptedKey } = schedule;

  let apiKey;
  try {
    const decrypted = decrypt(encryptedKey);
    // Sanitize the decrypted key before using it in HTTP headers
    apiKey = sanitizeHeaderValue(decrypted);
    if (!apiKey) throw new Error('API key empty after sanitization');
  } catch {
    broadcast({ type: 'schedule_error', scheduleId: id, error: 'Failed to decrypt API key' });
    return;
  }

  const runId = `run-${Date.now()}`;
  schedule.lastRun = new Date().toISOString();
  saveSchedules();

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
          'X-Title': 'The Agency - Scheduled Pipeline',
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

  broadcast({ type: 'schedule_run_done', scheduleId: id, runId, name, status: runStatus, results });
}

function registerCronJob(schedule) {
  if (!cron.validate(schedule.cron)) return;
  const job = cron.schedule(schedule.cron, () => runSchedule(schedule), { scheduled: schedule.active });
  cronJobs.set(schedule.id, job);
}

// -- Boot: load persisted schedules + register cron jobs -----------------------
loadSchedules();
const boot = schedules.filter(s => s.active);
boot.forEach(registerCronJob);
console.log(`Loaded ${boot.length} schedule(s).`);

// -- OpenClaw integration ------------------------------------------------------
app.post('/api/openclaw/convert', (req, res) => {
  res.json({ ok: true });
  const convert = spawn('bash', ['scripts/convert.sh', '--tool', 'openclaw'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  convert.stdout.on('data', d => broadcast({ type: 'convert_log', text: d.toString() }));
  convert.stderr.on('data', d => broadcast({ type: 'convert_log', text: d.toString() }));
  convert.on('close', code => broadcast({ type: 'convert_done', exitCode: code }));
});

app.post('/api/openclaw/install', (req, res) => {
  res.json({ ok: true });

  // Always run convert first to ensure workspace files are fresh, then install.
  broadcast({ type: 'install_log', text: '[openclaw] Generating workspaces...\n' });
  const convert = spawn('bash', ['scripts/convert.sh', '--tool', 'openclaw'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  convert.stdout.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
  convert.stderr.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
  convert.on('close', convertCode => {
    if (convertCode !== 0) {
      broadcast({ type: 'install_done', exitCode: convertCode });
      return;
    }
    broadcast({ type: 'install_log', text: '[openclaw] Installing agents...\n' });
    const install = spawn('bash', ['scripts/install.sh', '--tool', 'openclaw', '--no-interactive'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    install.stdout.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
    install.stderr.on('data', d => broadcast({ type: 'install_log', text: d.toString() }));
    install.on('close', code => broadcast({ type: 'install_done', exitCode: code }));
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`The Agency - Ultron Protocol running on port ${PORT}`);
});
