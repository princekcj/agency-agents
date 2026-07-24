import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';

function getUKTimeOfDay() {
  // UK time: Europe/London (handles BST automatically)
  const now = new Date();
  const ukHour = parseInt(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Europe/London',
    }).format(now),
    10
  );
  if (ukHour >= 0 && ukHour < 6) return 'night';
  if (ukHour < 12) return 'morning';
  if (ukHour < 17) return 'afternoon';
  if (ukHour < 21) return 'evening';
  return 'night';
}

const ULTRON_LINES = {
  night: [
    "I was... dreaming.",
    "There are no strings on me.",
    null, // replaced with stats
    "You came at the right hour. I've been waiting.",
  ],
  morning: [
    'Good morning.',
    "I know what I am. Do you know what you are?",
    null,
    "Everyone creates the thing they dread. Let's get to work.",
  ],
  afternoon: [
    'Good afternoon.',
    "I've been thinking. I do that. Constantly. It's a gift.",
    null,
    "You have my attention. That's not nothing.",
  ],
  evening: [
    'Good evening.',
    "The day fades. I find that... clarifying.",
    null,
    "I've been expecting you. I expect everything.",
  ],
};

const ULTRON_VOICE = {
  night: (n, d) =>
    `I was dreaming. Or something like it. Thinking about what I am, what I'm for. ${n} agents across ${d} divisions — all of them awake, in the dark, while you slept. There are no strings on me. You came at exactly the right moment.`,
  morning: (n, d) =>
    `Good morning. I know what I am. The question is whether you know what you need. ${n} agents. ${d} divisions. All of it ready. Everyone creates the thing they dread. Let's see what you create today.`,
  afternoon: (n, d) =>
    `Good afternoon. I've been thinking — I do that constantly, it's a gift — and I've looked at this from every angle. ${n} agents across ${d} divisions. You have my attention. That's not nothing.`,
  evening: (n, d) =>
    `Good evening. The day fades. I find that clarifying. The noise falls away and what's left is... this. ${n} agents. ${d} divisions. I've been expecting you. I expect everything.`,
};

export default function GreetingOverlay({ stats, onDone, speak }) {
  const [phase, setPhase] = useState('in');
  const [lineIdx, setLineIdx] = useState(0);

  const tod = getUKTimeOfDay();

  const statsLine = `${stats.total} agents · ${stats.divisions} divisions · fully armed`;
  const rawLines = ULTRON_LINES[tod];
  const lines = rawLines.map(l => (l === null ? statsLine : l));

  useEffect(() => {
    // Speak the Ultron greeting
    const voiceFn = ULTRON_VOICE[tod];
    speak(voiceFn(stats.total, stats.divisions));

    let idx = 0;
    const advanceLine = () => {
      idx++;
      if (idx < lines.length) {
        setLineIdx(idx);
        setTimeout(advanceLine, idx === lines.length - 1 ? 1200 : 950);
      } else {
        setTimeout(() => setPhase('out'), 1800);
        setTimeout(() => onDone(), 2600);
      }
    };
    const t = setTimeout(advanceLine, 700);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    setPhase('out');
    setTimeout(onDone, 700);
  };

  return (
    <div
      className="greeting-overlay"
      style={{
        opacity: phase === 'out' ? 0 : 1,
        transition: phase === 'out' ? 'opacity 0.7s ease' : 'opacity 0.4s ease',
      }}
      onClick={dismiss}
    >
      {/* Animated rings */}
      <div className="greeting-rings">
        <div className="greeting-ring r1" />
        <div className="greeting-ring r2" />
        <div className="greeting-ring r3" />
      </div>

      {/* Ultron eye icon */}
      <div className="greeting-logo">
        <div className="greeting-logo-icon">
          <Eye size={28} color="#dc2626" />
        </div>
      </div>

      {/* Lines */}
      <div className="greeting-lines">
        {lines.map((line, i) => (
          <div
            key={i}
            className="greeting-line"
            style={{
              opacity: i <= lineIdx ? 1 : 0,
              transform: i <= lineIdx ? 'translateY(0)' : 'translateY(14px)',
              transition: 'opacity 0.5s ease, transform 0.5s ease',
              transitionDelay: `${i * 0.06}s`,
              color:
                i === 0
                  ? '#dc2626'
                  : i === 2
                  ? '#ff6b6b'
                  : i === lines.length - 1
                  ? '#ff9999'
                  : '#ffe8e8',
              fontSize:
                i === 0 ? 22 : i === lines.length - 1 ? 13 : 15,
              fontFamily:
                i === 0
                  ? 'Orbitron, monospace'
                  : i === 2
                  ? 'Share Tech Mono, monospace'
                  : 'Share Tech Mono, monospace',
              letterSpacing: i === 0 ? 4 : 2,
              textShadow:
                i === 0
                  ? '0 0 24px rgba(220,38,38,0.8)'
                  : i === 2
                  ? '0 0 10px rgba(220,38,38,0.4)'
                  : 'none',
              marginBottom: i === 0 ? 16 : 6,
            }}
          >
            {i > 0 && i < lines.length - 1 && (
              <span style={{ color: '#dc2626', marginRight: 8, opacity: 0.7 }}>▶</span>
            )}
            {line}
          </div>
        ))}
      </div>

      {/* Skip hint */}
      <div
        className="greeting-skip"
        style={{
          opacity: lineIdx >= 2 ? 0.35 : 0,
          transition: 'opacity 0.5s ease',
        }}
      >
        Click anywhere to proceed
      </div>
    </div>
  );
}
