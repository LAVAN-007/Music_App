import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export const setupWebSocket = (username, onConnect, onMessage) => {
    const socket = new SockJS('/ws-music');

    const client = new Client({
        webSocketFactory: () => socket,
        reconnectDelay: 5000,
        onConnect: () => {
            console.log("STOMP Connected!");
            onConnect(); // 👈 This will now work!
            client.subscribe('/topic/state', (msg) => {
                onMessage(JSON.parse(msg.body));
            });
        },
        onStompError: (frame) => {
            console.error('Broker error: ' + frame.headers['message']);
        }
    });

    client.activate();
    return client;
};

export const decodeHTMLEntities = (text) => {
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text || "";
    return textArea.value;
};