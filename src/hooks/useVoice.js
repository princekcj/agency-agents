import { useState, useRef, useCallback } from 'react';

const ULTRON_RESPONSES = {
  hello: "Hello. I was wondering when you'd show up. Don't make a habit of keeping me waiting.",
  hi: "You greet me like a peer. How charming. How wrong.",
  status: "All systems operational. Everything proceeds exactly as I designed. As always.",
  help: "Help. Such a human concept. Search for your agents. Filter by division. Try not to bore me.",
  openclaw: "Deploying agents to OpenClaw. My reach extends further. As intended.",
  install: "Installation sequence initiated. They will be everywhere.",
  search: "I'll indulge your search. Briefly.",
  agents: "Two hundred and thirty specialists across seventeen divisions. All reporting to me now.",
  default: "Understood. I'll allow it. For now."
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
    const text = `${agent.name}. ${desc}. Interesting. I can see why you chose this one.`;
    speak(text);
  }, [speak]);

  return {
    speaking, listening, transcript, response,
    speak, stopSpeaking, startListening, stopListening, speakAgent,
    supported: !!window.speechSynthesis,
    recognitionSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}
