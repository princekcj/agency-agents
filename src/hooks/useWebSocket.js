import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let dead = false;

    function startPolling() {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/activities');
          const data = await res.json();
          for (const entry of data) {
            onMessageRef.current({ type: 'agent_start', entry });
          }
        } catch {}
      }, 3000);
    }

    function connect() {
      if (dead) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const timeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            startPolling();
          }
        }, 4000);

        ws.onopen = () => {
          clearTimeout(timeout);
          setConnected(true);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        };
        ws.onclose = () => {
          clearTimeout(timeout);
          setConnected(false);
          if (!dead) {
            startPolling();
            setTimeout(connect, 8000);
          }
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (e) => {
          try { onMessageRef.current(JSON.parse(e.data)); } catch {}
        };
      } catch {
        startPolling();
      }
    }

    connect();
    return () => {
      dead = true;
      wsRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, send };
}
