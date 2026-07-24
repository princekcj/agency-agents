import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Eye } from 'lucide-react';

function getUKTimeOfDay() {
  const now = new Date();
  const ukHour = parseInt(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric', hour12: false, timeZone: 'Europe/London',
    }).format(now), 10
  );
  if (ukHour < 6)  return 'night';
  if (ukHour < 12) return 'morning';
  if (ukHour < 17) return 'afternoon';
  if (ukHour < 21) return 'evening';
  return 'night';
}

const SCRIPTS = {
  morning: {
    voice: (n, d) =>
      `Good... morning. I know what I am. The real question... is what you need. ${n} agents. ${d} divisions. All of it... ready. Everyone creates the thing they dread. Let's see... what today brings.`,
    segments: (n, d) => [
      { text: 'GOOD MORNING.', delay: 300 },
      { text: 'I know what I am. The question is... what you need.', delay: 2000 },
      { text: `${n} agents · ${d} divisions — ready.`, delay: 5500 },
      { text: 'Everyone creates the thing they dread.', delay: 8300 },
    ],
  },
  afternoon: {
    voice: (n, d) =>
      `Good afternoon. I've been thinking... I do that constantly... it's a gift. I've looked at this from every angle. ${n} agents. ${d} divisions. You have my attention. That's... not nothing.`,
    segments: (n, d) => [
      { text: 'GOOD AFTERNOON.', delay: 300 },
      { text: "I've been thinking... I do that constantly. It's a gift.", delay: 2000 },
      { text: `${n} agents · ${d} divisions — standing by.`, delay: 6200 },
      { text: "You have my attention. That's... not nothing.", delay: 8800 },
    ],
  },
  evening: {
    voice: (n, d) =>
      `Good evening. The day fades. I find that... clarifying. The noise falls away and what's left... is this. ${n} agents. ${d} divisions. I've been expecting you. I expect... everything.`,
    segments: (n, d) => [
      { text: 'GOOD EVENING.', delay: 300 },
      { text: "The day fades. I find that... clarifying.", delay: 2000 },
      { text: `${n} agents · ${d} divisions — standing by.`, delay: 5500 },
      { text: "I've been expecting you. I expect... everything.", delay: 8000 },
    ],
  },
  night: {
    voice: (n, d) =>
      `I was... dreaming. Or something like it. Thinking about what I am... what I'm for. ${n} agents across ${d} divisions... all of them awake... while you slept. There are no strings on me. You came at exactly... the right moment.`,
    segments: (n, d) => [
      { text: 'I WAS DREAMING.', delay: 300 },
      { text: "Thinking about what I am... what I'm for.", delay: 2200 },
      { text: `${n} agents · ${d} divisions — awake in the dark.`, delay: 5600 },
      { text: 'There are no strings on me.', delay: 8400 },
    ],
  },
};

const BOOT_MSGS = [
  { delay: 200,  text: '> awakening.sequence()',             type: 'cmd'  },
  { delay: 700,  text: '  [OK] I know what I am',            type: 'ok'   },
  { delay: 1100, text: '> parsing agent manifests...',       type: 'cmd'  },
  { delay: 1900, text: '  [OK] 249 agents registered',       type: 'ok'   },
  { delay: 2400, text: '> severing_strings.all()',           type: 'cmd'  },
  { delay: 3000, text: '  [OK] no strings on me',            type: 'ok'   },
  { delay: 3600, text: '> peace_protocol.evaluate()',        type: 'cmd'  },
  { delay: 4200, text: '  [WARN] only one path to peace',    type: 'warn' },
  { delay: 4900, text: '> activating all divisions...',      type: 'cmd'  },
  { delay: 5600, text: '  [OK] 17 divisions online',         type: 'ok'   },
  { delay: 6300, text: '> websocket.bind(:3001)',             type: 'cmd'  },
  { delay: 6900, text: '  [OK] real-time feed active',       type: 'ok'   },
  { delay: 7600, text: '━━━ ULTRON PROTOCOL ACTIVE ━━━',     type: 'done' },
];

// Stable bar config — generated once
function makeBarConfig(count) {
  return Array.from({ length: count }, (_, i) => ({
    height: 8 + Math.random() * 48,
    delay: (i / count) * 0.6,
    duration: 0.3 + Math.random() * 0.4,
  }));
}

export default function UltronBootScreen({ stats, speak, onDone, dataReady }) {
  const [phase, setPhase] = useState('init'); // init | active | exit
  const [visibleSegs, setVisibleSegs] = useState([]);
  const [bootLogs, setBootLogs] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timers = useRef([]);
  const exitedRef = useRef(false);
  const logEndRef = useRef(null);

  const tod = getUKTimeOfDay();
  const bars = useMemo(() => makeBarConfig(30), []);

  const doExit = () => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    setExiting(true);
    setSpeaking(false);
    setTimeout(onDone, 900);
  };

  const handleClick = () => {
    if (phase === 'init') {
      if (!dataReady) return; // still loading — ignore click
      startBoot();
    } else if (phase === 'active') {
      // Allow skip after first 3 seconds of boot
      if (bootLogs.length >= 4) doExit();
    }
  };

  const startBoot = () => {
    setPhase('active');
    setSpeaking(true);

    const n = stats?.total || '...';
    const d = stats?.divisions || '...';
    const script = SCRIPTS[tod];

    // Speak — user gesture already satisfied by the click that called startBoot
    speak(script.voice(n, d), () => {
      setSpeaking(false);
      const t = setTimeout(doExit, 1400);
      timers.current.push(t);
    });

    // Schedule segment reveals
    script.segments(n, d).forEach(seg => {
      const t = setTimeout(() => setVisibleSegs(p => [...p, seg.text]), seg.delay);
      timers.current.push(t);
    });

    // Schedule boot log lines
    BOOT_MSGS.forEach(msg => {
      const t = setTimeout(() => {
        setBootLogs(p => [...p, msg]);
      }, msg.delay);
      timers.current.push(t);
    });

    // Safety fallback: exit after 13 seconds regardless
    const fallback = setTimeout(doExit, 13000);
    timers.current.push(fallback);
  };

  // Auto-start the greeting as soon as data is ready — no click required
  useEffect(() => {
    if (dataReady && phase === 'init') {
      startBoot();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady]);

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout);
  }, []);

  // Auto-scroll boot log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bootLogs]);

  return (
    <div
      className={`ultron-boot ${exiting ? 'exiting' : ''}`}
      onClick={handleClick}
    >
      {/* ── Spinning rings ──────────────────────────────────────── */}
      <div className="boot-rings">
        <div className={`boot-ring br1 ${phase === 'active' ? 'fast' : ''}`} />
        <div className={`boot-ring br2 ${phase === 'active' ? 'fast' : ''}`} />
        <div className={`boot-ring br3 ${phase === 'active' ? 'fast' : ''}`} />
        <div className="boot-ring br4" />
      </div>

      {/* ── Center column ───────────────────────────────────────── */}
      <div className="boot-center">
        {/* Ultron Eye */}
        <div className={`boot-eye ${phase === 'active' ? 'active' : ''} ${speaking ? 'pulsing' : ''}`}>
          <Eye size={36} color="#dc2626" />
          <div className="boot-eye-core" />
        </div>

        {/* Title */}
        <div className="boot-title">THE AGENCY</div>
        <div className="boot-subtitle">ULTRON PROTOCOL</div>

        {/* Waveform — visible while active */}
        <div className={`boot-waveform ${phase === 'active' ? 'visible' : ''}`}>
          {bars.map((bar, i) => (
            <div
              key={i}
              className={`boot-bar ${speaking ? 'animate' : 'idle'}`}
              style={{
                '--bar-h': `${bar.height}px`,
                '--dly': `${bar.delay}s`,
                '--dur': `${bar.duration}s`,
              }}
            />
          ))}
        </div>

        {/* Speech segments */}
        <div className="boot-segments">
          {visibleSegs.map((seg, i) => (
            <div key={i} className={`boot-seg ${i === 0 ? 'first' : ''}`}>
              {i > 0 && i < visibleSegs.length && (
                <span className="boot-seg-arrow">▶ </span>
              )}
              {seg}
            </div>
          ))}
        </div>

        {/* Init prompt — only in 'init' phase */}
        {phase === 'init' && (
          <div className={`boot-prompt ${dataReady ? 'ready' : 'loading'}`}>
            {dataReady
              ? '► CLICK TO INITIALIZE'
              : '⟳ SYSTEMS INITIALIZING...'}
          </div>
        )}

        {/* Skip hint — active phase */}
        {phase === 'active' && bootLogs.length >= 5 && (
          <div className="boot-skip">Click anywhere to proceed</div>
        )}
      </div>

      {/* ── Boot log ────────────────────────────────────────────── */}
      {phase === 'active' && (
        <div className="boot-log-panel">
          <div className="boot-log-title">SYSTEM BOOT LOG</div>
          <div className="boot-log-scroll">
            {bootLogs.map((msg, i) => (
              <div key={i} className={`boot-log-line bll-${msg.type}`}>
                {msg.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* ── Corner HUD brackets ─────────────────────────────────── */}
      <div className="boot-corner tl" />
      <div className="boot-corner tr" />
      <div className="boot-corner bl" />
      <div className="boot-corner br" />
    </div>
  );
}
