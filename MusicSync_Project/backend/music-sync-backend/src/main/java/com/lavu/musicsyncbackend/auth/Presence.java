package com.lavu.musicsyncbackend.auth;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Remembers when each signed-in user last talked to the server, to show friends who is online. */
@Component
public class Presence {

    private static final long ONLINE_WINDOW_MS = 75_000;

    private final Map<Long, Long> lastSeen = new ConcurrentHashMap<>();

    public void seen(Long userId) {
        lastSeen.put(userId, System.currentTimeMillis());
    }

    public void gone(Long userId) {
        lastSeen.remove(userId);
    }

    public boolean isOnline(Long userId) {
        Long at = lastSeen.get(userId);
        return at != null && System.currentTimeMillis() - at < ONLINE_WINDOW_MS;
    }
}
