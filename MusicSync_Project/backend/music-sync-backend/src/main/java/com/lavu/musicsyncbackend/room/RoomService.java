package com.lavu.musicsyncbackend.room;

import com.lavu.musicsyncbackend.service.SongCatalog;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Service
public class RoomService {

    // No 0/O/1/I so codes survive being read aloud or typed from a screenshot.
    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    public static final int CODE_LENGTH = 6;
    /** How long an empty room is kept, so reloads and late invitees still find it. */
    private static final long EMPTY_ROOM_TTL_MINUTES = 30;
    /** A lone listener reloading the page is gone for a moment; don't interrupt their music for that. */
    private static final long EMPTY_PAUSE_DELAY_SECONDS = 20;
    private static final int MAX_ROOMS = 5000;

    private final SongCatalog catalog;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> pendingRemovals = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "room-cleanup");
        t.setDaemon(true);
        return t;
    });

    public RoomService(SongCatalog catalog) {
        this.catalog = catalog;
    }

    public Room create(String createdBy) {
        if (rooms.size() >= MAX_ROOMS) return null;
        while (true) {
            String code = randomCode();
            Room room = new Room(code, createdBy, catalog);
            if (rooms.putIfAbsent(code, room) == null) {
                scheduleRemovalIfEmpty(room); // never joined rooms expire too
                return room;
            }
        }
    }

    public Room get(String code) {
        return code == null ? null : rooms.get(normalize(code));
    }

    public void cancelRemoval(Room room) {
        ScheduledFuture<?> pending = pendingRemovals.remove(room.getCode());
        if (pending != null) pending.cancel(false);
    }

    public void scheduleRemovalIfEmpty(Room room) {
        if (!room.isEmpty()) return;
        String code = room.getCode();
        long graceMillis = TimeUnit.SECONDS.toMillis(EMPTY_PAUSE_DELAY_SECONDS);
        scheduler.schedule(() -> room.pauseIfEmptyFor(graceMillis), graceMillis + 50, TimeUnit.MILLISECONDS);
        ScheduledFuture<?> future = scheduler.schedule(() -> {
            pendingRemovals.remove(code);
            rooms.computeIfPresent(code, (k, r) -> r.isEmpty() ? null : r);
        }, EMPTY_ROOM_TTL_MINUTES, TimeUnit.MINUTES);
        ScheduledFuture<?> previous = pendingRemovals.put(code, future);
        if (previous != null) previous.cancel(false);
    }

    public static String normalize(String code) {
        return code.trim().toUpperCase();
    }

    private String randomCode() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) sb.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
        return sb.toString();
    }
}
