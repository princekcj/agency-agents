import React, { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/**
 * Full-screen greeting that fades out after JARVIS finishes speaking.
 * props:
 *   stats      — { total, divisions }
 *   activeCount — number of agents currently working
 *   onDone     — called when the overlay removes itself
 *   speak      — (text) => void
 */
export default function GreetingOverlay({ stats, activeCount, onDone, speak }) {
  const [phase, setPhase] = useState('in');   // 'in' | 'hold' | 'out'
  const [lineIdx, setLineIdx] = useState(0);

  const tod = timeOfDay();

  const lines = [
    `Good ${tod}.`,
    `All systems online.`,
    `${stats.total} specialist agents across ${stats.divisions} divisions standing by.`,
    activeCount > 0
      ? `${activeCount} agent${activeCount > 1 ? 's are' : ' is'} currently active.`
      : `No active tasks at the moment — ready for your command.`,
    `How can I assist you today?`,
  ];

  useEffect(() => {
    // Speak the full greeting
    const fullGreeting = `Good ${tod}. All systems online. ${stats.total} specialist agents across ${stats.divisions} divisions are standing by. ${
      activeCount > 0
        ? `${activeCount} ${activeCount > 1 ? 'agents are' : 'agent is'} currently active.`
        : 'No active tasks at the moment — ready for your command.'
    } How can I assist you today?`;
    speak(fullGreeting);

    // Animate lines one at a time
    let idx = 0;
    const advanceLine = () => {
      idx++;
      if (idx < lines.length) {
        setLineIdx(idx);
        setTimeout(advanceLine, idx === lines.length - 1 ? 1200 : 900);
      } else {
        // Wait a moment then fade out
        setTimeout(() => setPhase('out'), 1600);
        setTimeout(() => onDone(), 2300);
      }
    };
    const t = setTimeout(advanceLine, 700);
    return () => clearTimeout(t);
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

      {/* Logo */}
      <div className="greeting-logo">
        <div className="greeting-logo-icon">
          <Zap size={28} color="#00d4ff" />
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
              transform: i <= lineIdx ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 0.5s ease, transform 0.5s ease',
              transitionDelay: `${i * 0.05}s`,
              color: i === 0 ? '#00d4ff' : i === lines.length - 1 ? '#00ffea' : '#e0f4ff',
              fontSize: i === 0 ? 22 : i === lines.length - 1 ? 13 : 15,
              fontFamily: i === 0 ? 'Orbitron, monospace' : 'Share Tech Mono, monospace',
              letterSpacing: i === 0 ? 4 : 2,
              textShadow: i === 0 ? '0 0 20px rgba(0,212,255,0.7)' : 'none',
              marginBottom: i === 0 ? 16 : 6,
            }}
          >
            {i > 0 && i < lines.length - 1 && (
              <span style={{ color: '#00d4ff', marginRight: 8, opacity: 0.7 }}>▶</span>
            )}
            {line}
          </div>
        ))}
      </div>

      {/* Skip hint */}
      <div
        className="greeting-skip"
        style={{ opacity: lineIdx >= 2 ? 0.4 : 0, transition: 'opacity 0.5s ease' }}
      >
        Click anywhere to continue
      </div>
    </div>
  );
}
