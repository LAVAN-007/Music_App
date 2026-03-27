package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.model.SyncMessage;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@Controller
public class SyncController {

    private final SimpMessagingTemplate messagingTemplate;

    // Thread-safe session tracking
    private final Map<String, String> sessionToUser = Collections.synchronizedMap(new HashMap<>());

    // Playback state
    private int currentSongId = 1;
    private double currentTimestamp = 0;
    private long lastActionTime = System.currentTimeMillis();
    private boolean isPlaying = false;

    private static final Set<String> VALID_USERS = Set.of("vijay", "lavanya");

    public SyncController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/sync")
    public void handleSync(SyncMessage message, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();

        if ("JOIN".equals(message.getAction())) {
            String user = message.getUsername() != null ? message.getUsername().toLowerCase() : "";
            if (VALID_USERS.contains(user)) {
                sessionToUser.put(sessionId, user);

                // Broadcast updated presence to all
                broadcastPresence();

                // Send current playback state to all (new joiner will sync)
                SyncMessage stateMsg = new SyncMessage();
                stateMsg.setAction("STATE");
                stateMsg.setSongId(currentSongId);
                stateMsg.setTimestamp(getLiveTimestamp());
                stateMsg.setPlaying(isPlaying);
                stateMsg.setConnectedUsers(new HashSet<>(sessionToUser.values()));
                messagingTemplate.convertAndSend("/topic/state", stateMsg);
            }
        } else if ("CHAT".equals(message.getAction())) {
            // Chat messages — broadcast as-is, do not touch playback state
            messagingTemplate.convertAndSend("/topic/state", message);
        } else {
            // PLAY / PAUSE / etc — update state and broadcast
            if (message.getSongId() != null && message.getSongId() > 0) currentSongId = message.getSongId();
            if (message.getTimestamp() != null) currentTimestamp = message.getTimestamp();
            lastActionTime = System.currentTimeMillis();
            isPlaying = "PLAY".equals(message.getAction());

            message.setConnectedUsers(new HashSet<>(sessionToUser.values()));
            message.setPlaying(isPlaying);
            messagingTemplate.convertAndSend("/topic/state", message);
        }
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        String user = sessionToUser.remove(sessionId);
        if (user != null) {
            broadcastPresence();
        }
    }

    private void broadcastPresence() {
        SyncMessage msg = new SyncMessage();
        msg.setAction("PRESENCE");
        msg.setConnectedUsers(new HashSet<>(sessionToUser.values()));
        messagingTemplate.convertAndSend("/topic/state", msg);
    }

    private double getLiveTimestamp() {
        if (isPlaying) {
            double elapsed = (System.currentTimeMillis() - lastActionTime) / 1000.0;
            return currentTimestamp + elapsed;
        }
        return currentTimestamp;
    }
}
