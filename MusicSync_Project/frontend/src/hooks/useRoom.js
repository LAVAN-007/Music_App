import { useCallback, useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import { api, getToken } from '../lib/api';
import { syncClock } from '../lib/clock';
import { useLatest } from './useLatest';

/**
 * Live connection to one room. The server owns the playback state; this hook
 * mirrors it and exposes `send` for commands.
 *
 * handlers: { onGone, onUnauthorized, onChat, onActivity }
 */
export function useRoom(code, handlers) {
  const [status, setStatus] = useState('connecting'); // connecting | connected | reconnecting
  const [state, setState] = useState(null);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const clientRef = useRef(null);
  const handlersRef = useLatest(handlers);

  useEffect(() => {
    let closed = false;
    const topic = `/topic/room/${code}`;

    const onEvent = (event) => {
      if (event.type === 'STATE') {
        setState(prev => (!prev || event.state.version >= prev.version ? event.state : prev));
        if (event.action !== 'JOIN') handlersRef.current.onActivity?.(event);
      } else if (event.type === 'PRESENCE') {
        setUsers(event.users);
      } else if (event.type === 'CHAT') {
        setMessages(prev => (prev.some(m => m.id === event.message.id) ? prev : [...prev, event.message]));
        handlersRef.current.onChat?.(event.message);
      }
    };

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const client = new Client({
      brokerURL: `${scheme}://${window.location.host}/ws`,
      connectHeaders: { Authorization: `Bearer ${getToken() || ''}` },
      reconnectDelay: 1500,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      connectionTimeout: 8000,
      // The server drops sockets that present an invalid token, which would otherwise look like
      // a flaky network and retry forever. Check the session before every attempt.
      beforeConnect: async () => {
        try {
          await api('/auth/me');
        } catch (e) {
          if (!closed && e.status === 401) {
            handlersRef.current.onUnauthorized?.();
            await client.deactivate();
          }
        }
      },
      onConnect: async () => {
        try {
          // Confirms the room still exists (the server may have restarted) and loads chat history.
          const info = await api(`/rooms/${code}`);
          if (closed) return;
          setMessages(info.messages);
          setUsers(info.users);
        } catch (e) {
          if (closed) return;
          if (e.status === 404) handlersRef.current.onGone?.();
          else if (e.status === 401) handlersRef.current.onUnauthorized?.();
          else client.forceDisconnect(); // network blip: let the client retry
          return;
        }
        await syncClock();
        if (closed || !client.connected) return;
        client.subscribe(topic, frame => onEvent(JSON.parse(frame.body)));
        client.publish({ destination: `/app/room/${code}`, body: JSON.stringify({ type: 'JOIN' }) });
        setStatus('connected');
      },
      onWebSocketClose: () => {
        if (!closed) setStatus(s => (s === 'connected' ? 'reconnecting' : s));
      },
    });
    clientRef.current = client;
    client.activate();

    return () => {
      closed = true;
      clientRef.current = null;
      client.deactivate();
    };
  }, [code, handlersRef]);

  /** @returns false if the command could not be sent because we're offline */
  const send = useCallback((command) => {
    const client = clientRef.current;
    if (!client?.connected) return false;
    client.publish({ destination: `/app/room/${code}`, body: JSON.stringify(command) });
    return true;
  }, [code]);

  return { status, state, users, messages, send };
}
