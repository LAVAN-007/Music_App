package com.lavu.musicsyncbackend.room;

import java.util.List;

/** A broadcast to everyone in a room. {@code type} is STATE, PRESENCE or CHAT. */
public record RoomEvent(String type, RoomState state, String action, String by, List<String> users,
                        ChatMessage message, long serverTime) {

    static RoomEvent state(RoomState state, String action, String by) {
        return new RoomEvent("STATE", state, action, by, null, null, System.currentTimeMillis());
    }

    static RoomEvent presence(List<String> users) {
        return new RoomEvent("PRESENCE", null, null, null, users, null, System.currentTimeMillis());
    }

    static RoomEvent chat(ChatMessage message) {
        return new RoomEvent("CHAT", null, null, null, null, message, System.currentTimeMillis());
    }
}
