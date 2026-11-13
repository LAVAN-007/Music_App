package com.lavu.musicsyncbackend.room;

import com.lavu.musicsyncbackend.service.SongCatalog;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** One listening room. All access is synchronized on the instance. */
public class Room {

    static final int MAX_QUEUE = 200;
    static final int MAX_MESSAGES = 100;
    static final int MAX_CHAT_LENGTH = 500;
    /** A new song starts this far in the future, so every listener can load it and begin together at 0:00. */
    static final long START_LEAD_MILLIS = 1000;
    /** A seek during playback resumes this far in the future, for the same reason. */
    static final long SEEK_LEAD_MILLIS = 600;

    private final String code;
    private final String createdBy;
    private final SongCatalog catalog;

    private final Map<String, String> sessions = new LinkedHashMap<>(); // ws session id -> username
    private final List<Integer> queue = new ArrayList<>();
    private final Deque<ChatMessage> messages = new ArrayDeque<>();

    private Integer songId;
    private double position;
    private boolean playing;
    private long updatedAt = System.currentTimeMillis();
    private long version;
    private long nextMessageId = 1;
    private long emptySince = System.currentTimeMillis(); // 0 while someone is connected
    private long lead; // how far ahead the command being applied schedules playback

    public Room(String code, String createdBy, SongCatalog catalog) {
        this.code = code;
        this.createdBy = createdBy;
        this.catalog = catalog;
        this.songId = catalog.firstId();
    }

    public String getCode() { return code; }
    public String getCreatedBy() { return createdBy; }

    public synchronized RoomState state() {
        return new RoomState(songId, position, playing, updatedAt, version, List.copyOf(queue));
    }

    public synchronized List<String> users() {
        return List.copyOf(new LinkedHashSet<>(sessions.values()));
    }

    /** Number of connected devices. */
    public synchronized int listeners() {
        return sessions.size();
    }

    public synchronized List<ChatMessage> messages() {
        return List.copyOf(messages);
    }

    public synchronized boolean hasSession(String sessionId) {
        return sessions.containsKey(sessionId);
    }

    public synchronized boolean isEmpty() {
        return sessions.isEmpty();
    }

    /** @return true if this user had no other connection in the room */
    public synchronized boolean join(String sessionId, String username) {
        boolean isNew = !sessions.containsValue(username);
        sessions.put(sessionId, username);
        emptySince = 0;
        return isNew;
    }

    /** @return the username if that was the user's last connection, otherwise null */
    public synchronized String leave(String sessionId) {
        String username = sessions.remove(sessionId);
        if (username != null && sessions.isEmpty()) emptySince = System.currentTimeMillis();
        if (username == null || sessions.containsValue(username)) return null;
        return username;
    }

    /**
     * Holds the position once nobody has been listening for {@code minEmptyMillis}, so the room
     * doesn't play on to an empty house. Shorter gaps (a page reload) are left alone.
     */
    public synchronized void pauseIfEmptyFor(long minEmptyMillis) {
        if (sessions.isEmpty() && playing && System.currentTimeMillis() - emptySince >= minEmptyMillis) {
            position = livePosition();
            playing = false;
            touch();
        }
    }

    public synchronized ChatMessage addMessage(String username, String text, boolean system) {
        ChatMessage message = new ChatMessage(nextMessageId++, username, text, System.currentTimeMillis(), system);
        messages.addLast(message);
        while (messages.size() > MAX_MESSAGES) messages.removeFirst();
        return message;
    }

    /**
     * Applies a playback or queue command.
     *
     * @return true if the state changed and should be broadcast
     */
    public synchronized boolean apply(RoomCommand cmd) {
        if (songId == null) songId = catalog.firstId(); // library finished loading after the room was created
        switch (cmd.type()) {
            case "PLAY" -> {
                if (songId == null) return false;
                position = cmd.position() != null ? clamp(cmd.position()) : livePosition();
                playing = true;
            }
            case "PAUSE" -> {
                position = cmd.position() != null ? clamp(cmd.position()) : livePosition();
                playing = false;
            }
            case "SEEK" -> {
                if (cmd.position() == null) return false;
                position = clamp(cmd.position());
                if (playing) lead = SEEK_LEAD_MILLIS;
            }
            case "SELECT" -> {
                if (catalog.byId(cmd.songId()) == null) return false;
                start(cmd.songId());
            }
            case "NEXT" -> {
                if (!advance()) return false;
            }
            case "ENDED" -> {
                // Every listener reports the end of a track; only the first report for the current one counts.
                if (songId == null || !songId.equals(cmd.songId())) return false;
                if (cmd.version() != null && cmd.version() != version) return false;
                if (!advance()) return false;
            }
            case "PREV" -> {
                if (songId == null) return false;
                if (livePosition() > 3) start(songId);
                else start(catalog.neighbour(songId, -1));
            }
            case "QUEUE_ADD" -> {
                if (catalog.byId(cmd.songId()) == null || queue.size() >= MAX_QUEUE) return false;
                queue.add(cmd.songId());
            }
            case "QUEUE_REMOVE" -> {
                if (!validIndex(cmd.index())) return false;
                queue.remove((int) cmd.index());
            }
            case "QUEUE_PLAY" -> {
                if (!validIndex(cmd.index())) return false;
                start(queue.remove((int) cmd.index()));
            }
            case "QUEUE_CLEAR" -> {
                if (queue.isEmpty()) return false;
                queue.clear();
            }
            default -> {
                return false;
            }
        }
        touch();
        return true;
    }

    private boolean advance() {
        Integer next = queue.isEmpty() ? catalog.neighbour(songId, 1) : queue.remove(0);
        if (next == null) return false;
        start(next);
        return true;
    }

    private void start(Integer id) {
        songId = id;
        position = 0;
        playing = true;
        lead = START_LEAD_MILLIS;
    }

    private void touch() {
        updatedAt = System.currentTimeMillis() + lead;
        lead = 0;
        version++;
    }

    /** During a lead, playback has not begun yet and the position holds. */
    private double livePosition() {
        return playing ? position + Math.max(0, System.currentTimeMillis() - updatedAt) / 1000.0 : position;
    }

    private boolean validIndex(Integer index) {
        return index != null && index >= 0 && index < queue.size();
    }

    private static double clamp(double value) {
        if (Double.isNaN(value) || value < 0) return 0;
        return Math.min(value, 24 * 60 * 60);
    }
}
