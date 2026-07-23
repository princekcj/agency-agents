import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { spawn } from 'child_process';

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
          divisionColor: DIVISIONS[div]?.color || '#6366F1',
          divisionIcon: DIVISIONS[div]?.icon || 'Sparkles',
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

// Activity simulation — random agent activity stream
const ACTIVITIES = [
  'Analyzing codebase structure...',
  'Reviewing pull request...',
  'Writing unit tests...',
  'Optimizing database queries...',
  'Generating API documentation...',
  'Running security scan...',
  'Refactoring legacy code...',
  'Designing system architecture...',
  'Auditing dependencies...',
  'Processing data pipeline...',
  'Building CI/CD workflow...',
  'Monitoring performance metrics...',
  'Generating compliance report...',
  'Scaffolding new microservice...',
  'Reviewing marketing copy...',
];

const RESULTS = [
  'Completed successfully ✓',
  'Found 3 issues, all resolved ✓',
  'Report generated and saved ✓',
  'All tests passing (47/47) ✓',
  'Optimization reduced latency by 34% ✓',
  'Documentation updated ✓',
  'No vulnerabilities found ✓',
  'PR approved with 2 suggestions ✓',
];

let activityInterval = null;
const activeAgents = new Map();

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connected', message: 'JARVIS online. All systems operational.' }));

  // Send current active agents
  if (activeAgents.size > 0) {
    ws.send(JSON.stringify({ type: 'activity_state', agents: Array.from(activeAgents.values()) }));
  }
});

// REST fallback for activity state
app.get('/api/activities', (req, res) => {
  res.json(Array.from(activeAgents.values()));
});

// Simulate agent activity
function simulateActivity() {
  const agents = getAgents();
  if (agents.length === 0) return;

  const agent = agents[Math.floor(Math.random() * agents.length)];
  const action = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
  const id = `${agent.id}-${Date.now()}`;

  const entry = {
    id,
    agentId: agent.id,
    agentName: agent.name,
    agentEmoji: agent.emoji,
    division: agent.division,
    divisionColor: agent.divisionColor,
    action,
    status: 'working',
    startedAt: new Date().toISOString(),
    result: null,
  };

  activeAgents.set(id, entry);
  broadcast({ type: 'agent_start', entry });

  // Complete after 5-15 seconds
  const delay = 5000 + Math.random() * 10000;
  setTimeout(() => {
    const result = RESULTS[Math.floor(Math.random() * RESULTS.length)];
    entry.status = 'done';
    entry.result = result;
    entry.completedAt = new Date().toISOString();
    activeAgents.set(id, entry);
    broadcast({ type: 'agent_done', entry });

    // Remove from active after 8 more seconds
    setTimeout(() => activeAgents.delete(id), 8000);
  }, delay);
}

// Start activity sim every 4 seconds
activityInterval = setInterval(simulateActivity, 4000);
// Kick off a few immediately
setTimeout(simulateActivity, 500);
setTimeout(simulateActivity, 1500);
setTimeout(simulateActivity, 2500);

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`The Agency API running on port ${PORT}`);
});
