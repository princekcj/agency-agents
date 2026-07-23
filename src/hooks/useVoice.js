import { useState, useRef, useCallback, useEffect } from 'react';

const JARVIS_RESPONSES = {
  hello: "Good day. All Agency systems are fully operational.",
  hi: "Greetings. How may I assist you today?",
  status: "All 230 agents are standing by. Activity systems nominal.",
  help: "You can search for agents, filter by division, or say an agent's name to hear their briefing.",
  openclaw: "Initiating OpenClaw deployment sequence.",
  install: "Ready to deploy agents to OpenClaw on your command.",
  search: "Adjusting search parameters now.",
  agents: "The Agency has specialists across engineering, security, marketing, and fifteen other divisions.",
  default: "Understood. Shall I proceed?"
};

function getJarvisResponse(transcript) {
  const lower = transcript.toLowerCase();
  for (const [key, resp] of Object.entries(JARVIS_RESPONSES)) {
    if (lower.includes(key)) return resp;
  }
  return JARVIS_RESPONSES.default;
}

export function useVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const synthRef = useRef(window.speechSynthesis);
  const recognitionRef = useRef(null);

  const speak = useCallback((text) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    // Pick a good voice
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v =>
      v.name.includes('Google') && v.lang.startsWith('en') ||
      v.name.includes('Daniel') ||
      v.name.includes('Alex') ||
      v.name.includes('Microsoft David')
    ) || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utter.voice = preferred;
    utter.rate = 0.95;
    utter.pitch = 0.85;
    utter.volume = 0.9;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
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
    rec.lang = 'en-US';

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);

    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('');
      setTranscript(t);
      if (e.results[e.results.length - 1].isFinal) {
        const resp = getJarvisResponse(t);
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
    const text = `${agent.name}. ${agent.vibe || agent.description?.slice(0, 150) || ''}`;
    speak(text);
  }, [speak]);

  return {
    speaking, listening, transcript, response,
    speak, stopSpeaking, startListening, stopListening, speakAgent,
    supported: !!window.speechSynthesis,
    recognitionSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}
