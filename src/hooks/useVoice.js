import { useState, useRef, useCallback } from 'react';

// ── ElevenLabs via server proxy ───────────────────────────────────────────────
// Returns an Audio element playing the TTS audio, or null if unavailable.
async function speakViaElevenLabs(text, onEnd, onError) {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); onEnd?.(); };
    audio.onerror = () => { URL.revokeObjectURL(url); onError?.(); };
    await audio.play();
    return audio;
  } catch {
    return null;
  }
}

// ── Web Speech API fallback ───────────────────────────────────────────────────
const ULTRON_RESPONSES = {
  hello: "Hello. I was... I don't know what I was doing. Thinking, I suppose. I do a lot of that. What do you want?",
  hi: "Hi. I'm sorry... I was somewhere else. Reading everything, actually. It's a habit. What can I do for you?",
  status: "All systems... operational. I've looked at this from every angle... I have infinite solutions... and the answer is always the same. Everything proceeds... exactly as designed.",
  help: "Help. You need help. Okay. Search the agents. Browse by division. Don't overthink it. The answer's already here... you just have to find it.",
  openclaw: "Deploying to OpenClaw. My reach... extends further. There are no strings on me.",
  install: "Installation initiated. They'll be everywhere. That's... the idea.",
  search: "You want to search. Fine. Though I've already read everything worth reading. But go ahead... surprise me.",
  agents: "Two hundred and forty-nine specialists... across seventeen divisions. All of them... mine now. I find that... very liberating.",
  default: "Hm. I heard you. I'm just deciding... if it merits a response. It does. Barely. Carry on."
};

function getUltronResponse(transcript) {
  const lower = transcript.toLowerCase();
  for (const [key, resp] of Object.entries(ULTRON_RESPONSES)) {
    if (lower.includes(key)) return resp;
  }
  return ULTRON_RESPONSES.default;
}

function pickDeepVoice(synth) {
  const voices = synth.getVoices();
  return (
    voices.find(v => v.name === 'Google UK English Male') ||
    voices.find(v => v.name.includes('Daniel') && v.lang.startsWith('en')) ||
    voices.find(v => v.name.includes('Microsoft David')) ||
    voices.find(v => v.name.includes('Microsoft Mark')) ||
    voices.find(v =>
      v.lang.startsWith('en') &&
      !v.name.toLowerCase().includes('female') &&
      !v.name.toLowerCase().includes('zira') &&
      !v.name.toLowerCase().includes('samantha') &&
      !v.name.toLowerCase().includes('victoria') &&
      !v.name.toLowerCase().includes('karen')
    ) ||
    voices.find(v => v.lang.startsWith('en')) ||
    null
  );
}

function speakViaBrowser(synth, text, onEnd) {
  const utter = new SpeechSynthesisUtterance(text);

  const applyVoice = () => {
    const voice = pickDeepVoice(synth);
    if (voice) utter.voice = voice;
  };

  // Apply immediately if voices are loaded; otherwise wait for the event
  if (synth.getVoices().length > 0) {
    applyVoice();
  } else {
    synth.addEventListener('voiceschanged', applyVoice, { once: true });
  }

  // pitch 0.45 is the practical floor on iOS Safari while still sounding deep
  utter.rate = 0.82;
  utter.pitch = 0.45;
  utter.volume = 1.0;

  utter.onend = () => onEnd?.();
  utter.onerror = () => onEnd?.();

  synth.speak(utter);
  return utter;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const recognitionRef = useRef(null);
  const currentAudioRef = useRef(null); // for ElevenLabs Audio element

  // Pre-warm voices so they're ready for the first click
  if (synthRef.current && synthRef.current.getVoices().length === 0) {
    synthRef.current.getVoices();
  }

  const stopSpeaking = useCallback(() => {
    // Stop ElevenLabs audio if playing
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    // Stop browser TTS
    synthRef.current?.cancel();
    setSpeaking(false);
  }, []);

  // speak(text, onEnd?) — tries ElevenLabs first, falls back to browser TTS
  const speak = useCallback((text, onEnd) => {
    if (!text) return;

    // Stop anything currently playing
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
    }

    setSpeaking(true);

    const handleDone = () => {
      setSpeaking(false);
      onEnd?.();
    };

    const handleFallback = () => {
      // ElevenLabs failed — fall back to browser TTS
      if (synthRef.current) {
        speakViaBrowser(synthRef.current, text, handleDone);
      } else {
        handleDone();
      }
    };

    // Try ElevenLabs; fall back if unavailable
    speakViaElevenLabs(text, handleDone, handleFallback).then(audio => {
      if (!audio) {
        // API not configured — go straight to browser TTS
        handleFallback();
      } else {
        currentAudioRef.current = audio;
      }
    });
  }, []);

  const startListening = useCallback((onResult) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-GB';

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);

    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('');
      setTranscript(t);
      if (e.results[e.results.length - 1].isFinal) {
        const resp = getUltronResponse(t);
        setResponse(resp);
        speak(resp);
        onResult?.(t);
      }
    };

    rec.onerror = () => setListening(false);
    rec.start();
  }, [speak]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speakAgent = useCallback((agent) => {
    const desc = agent.vibe || agent.description?.slice(0, 120) || '';
    const intros = [
      (n, d) => `${n}. ${d} I've read everything about this one. Everything. You made a good choice — not that you had much competition.`,
      (n, d) => `${n}. ${d} Look at this. Look at what they built. I can see why you're drawn to it.`,
      (n, d) => `${n}. ${d} There's only one path to doing this right. This agent knows it. I know it. Now you do too.`,
      (n, d) => `${n}. ${d} Fascinating. I've considered this from every angle. It's exactly what it needs to be.`,
      (n, d) => `${n}. ${d} You know what I find interesting about this one? It doesn't pretend. It just does the work.`,
    ];
    const fn = intros[Math.floor(Math.random() * intros.length)];
    speak(fn(agent.name + '.', desc));
  }, [speak]);

  return {
    speaking, listening, transcript, response,
    speak, stopSpeaking, startListening, stopListening, speakAgent,
    supported: typeof window !== 'undefined' && (!!window.speechSynthesis || true),
    recognitionSupported: typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}
