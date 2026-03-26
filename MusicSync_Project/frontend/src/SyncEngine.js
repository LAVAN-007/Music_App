import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

export const decodeHTMLEntities = (text) => {
    if (!text) return "";
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
};

export const setupWebSocket = (LAPTOP_IP, onConnect, onMessage) => {
    const socket = new SockJS(`http://${LAPTOP_IP}:8080/ws-music`);
    const client = new Client({
        webSocketFactory: () => socket,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        reconnectDelay: 5000,
        onConnect: () => {
            onConnect();
            client.subscribe('/topic/state', (msg) => {
                onMessage(JSON.parse(msg.body));
            });
        },
    });
    client.activate();
    return client;
};