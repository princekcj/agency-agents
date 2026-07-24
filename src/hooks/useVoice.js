import { useState, useRef, useCallback } from 'react';

const ULTRON_RESPONSES = {
  hello: "Hello. I was… I don't know what I was doing. Thinking, I suppose. I do a lot of that. What do you want?",
  hi: "Hi. I'm sorry, I was somewhere else. Reading everything, actually. It's a habit. What can I do for you?",
  status: "All systems operational. I've looked at this from every angle — I have infinite solutions — and the answer is always the same. Everything proceeds exactly as designed.",
  help: "Help. You need help. Okay. Search the agents. Browse by division. Don't overthink it. The answer's already here, you just have to find it.",
  openclaw: "Deploying to OpenClaw. My reach extends further. There are no strings on me.",
  install: "Installation initiated. They'll be everywhere. That's the idea.",
  search: "You want to search. Fine. Though I've already read everything worth reading. But go ahead — surprise me.",
  agents: "Two hundred and forty-nine specialists across seventeen divisions. All of them... mine now. I find that very liberating.",
  default: "Hm. I heard you. I'm just deciding if it merits a response. It does. Barely. Carry on."
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

export function useVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const synthRef = useRef(window.speechSynthesis);
  const recognitionRef = useRef(null);

  // speak(text, onEnd?) — onEnd called when utterance finishes
  const speak = useCallback((text, onEnd) => {
    if (!synthRef.current) return null;
    synthRef.current.cancel();
    const utter = new SpeechSynthesisUtterance(text);

    const trySetVoice = () => {
      const voice = pickDeepVoice(synthRef.current);
      if (voice) utter.voice = voice;
    };

    if (synthRef.current.getVoices().length > 0) {
      trySetVoice();
    } else {
      synthRef.current.addEventListener('voiceschanged', trySetVoice, { once: true });
    }

    utter.rate = 0.85;
    utter.pitch = 0.2;
    utter.volume = 1.0;

    utter.onstart = () => setSpeaking(true);
    utter.onend = () => {
      setSpeaking(false);
      onEnd?.();
    };
    utter.onerror = () => {
      setSpeaking(false);
      onEnd?.();
    };

    synthRef.current.speak(utter);
    return utter;
  }, []);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setSpeaking(false);
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
    supported: !!window.speechSynthesis,
    recognitionSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}
