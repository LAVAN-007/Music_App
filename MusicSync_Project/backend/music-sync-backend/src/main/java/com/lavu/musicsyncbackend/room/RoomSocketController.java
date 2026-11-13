package com.lavu.musicsyncbackend.room;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Handles everything a client sends to {@code /app/room/{code}} and broadcasts on {@code /topic/room/{code}}. */
@Controller
public class RoomSocketController {

    private final SimpMessagingTemplate broker;
    private final RoomService rooms;
    private final Map<String, String> sessionRoom = new ConcurrentHashMap<>(); // ws session id -> room code

    public RoomSocketController(SimpMessagingTemplate broker, RoomService rooms) {
        this.broker = broker;
        this.rooms = rooms;
    }

    @MessageMapping("/room/{code}")
    public void handle(@DestinationVariable String code, RoomCommand cmd,
                       SimpMessageHeaderAccessor headers, Principal principal) {
        if (principal == null || cmd == null || cmd.type() == null) return;
        Room room = rooms.get(code);
        if (room == null) return;
        String sessionId = headers.getSessionId();
        String username = principal.getName();
        String topic = topic(room);

        if ("JOIN".equals(cmd.type())) {
            String previous = sessionRoom.put(sessionId, room.getCode());
            if (previous != null && !previous.equals(room.getCode())) leave(sessionId, previous);
            rooms.cancelRemoval(room);
            boolean isNew = room.join(sessionId, username);
            broker.convertAndSend(topic, RoomEvent.presence(room.users(), room.listeners()));
            broker.convertAndSend(topic, RoomEvent.state(room.state(), "JOIN", username));
            if (isNew) {
                broker.convertAndSend(topic, RoomEvent.chat(room.addMessage(username, username + " joined", true)));
            }
            return;
        }

        if (!room.hasSession(sessionId)) return; // must JOIN before doing anything else

        if ("CHAT".equals(cmd.type())) {
            String text = cmd.text() == null ? "" : cmd.text().strip();
            if (text.isEmpty()) return;
            if (text.length() > Room.MAX_CHAT_LENGTH) text = text.substring(0, Room.MAX_CHAT_LENGTH);
            broker.convertAndSend(topic, RoomEvent.chat(room.addMessage(username, text, false)));
            return;
        }

        if (room.apply(cmd)) {
            broker.convertAndSend(topic, RoomEvent.state(room.state(), cmd.type(), username));
        }
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String code = sessionRoom.remove(event.getSessionId());
        if (code != null) leave(event.getSessionId(), code);
    }

    private void leave(String sessionId, String code) {
        Room room = rooms.get(code);
        if (room == null) return;
        boolean wasHere = room.hasSession(sessionId);
        String left = room.leave(sessionId);
        String topic = topic(room);
        if (wasHere) broker.convertAndSend(topic, RoomEvent.presence(room.users(), room.listeners()));
        if (left != null) broker.convertAndSend(topic, RoomEvent.chat(room.addMessage(left, left + " left", true)));
        rooms.scheduleRemovalIfEmpty(room);
    }

    private static String topic(Room room) {
        return "/topic/room/" + room.getCode();
    }
}
