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
    static final int MAX_REPLY_SNIPPET = 140;
    /** A new song starts this far in the future, so every listener can load it and begin together at 0:00. */
    static final long START_LEAD_MILLIS = 1000;
    /** A seek during playback resumes this far in the future, for the same reason. */
    static final long SEEK_LEAD_MILLIS = 600;

    /** How early, by the room's own clock, a listener may report that the track has finished. */
    static final double END_TOLERANCE_SECONDS = 0.4;
    /** How long the room waits for slower listeners to reach the end before moving on without them. */
    static final long END_GRACE_MILLIS = 2500;

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
    private boolean shuffle; // when the queue is empty, the next song is picked at random
    private final java.util.Set<String> finished = new java.util.HashSet<>(); // sessions whose copy of the track has ended
    private long finishBy; // when to stop waiting for the rest, 0 while nobody has finished

    public Room(String code, String createdBy, SongCatalog catalog) {
        this.code = code;
        this.createdBy = createdBy;
        this.catalog = catalog;
        this.songId = catalog.firstId();
    }

    public String getCode() { return code; }
    public String getCreatedBy() { return createdBy; }

    public synchronized RoomState state() {
        return new RoomState(songId, position, playing, updatedAt, version, List.copyOf(queue), shuffle);
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
        finished.remove(sessionId);
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
        return addMessage(username, text, system, null, null);
    }

    /**
     * @param image   id of an uploaded picture, or null
     * @param replyTo id of the message being answered, or null; ignored if that message is no longer kept
     */
    public synchronized ChatMessage addMessage(String username, String text, boolean system, String image, Long replyTo) {
        ChatMessage.Reply reply = null;
        if (replyTo != null) {
            for (ChatMessage m : messages) {
                if (m.id() == replyTo && !m.system()) {
                    String snippet = m.text().length() > MAX_REPLY_SNIPPET ? m.text().substring(0, MAX_REPLY_SNIPPET) + "…" : m.text();
                    reply = new ChatMessage.Reply(m.id(), m.username(), snippet, m.image() != null);
                    break;
                }
            }
        }
        ChatMessage message = new ChatMessage(nextMessageId++, username, text, System.currentTimeMillis(), system, image, reply);
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
        return apply(cmd, null);
    }

    /** @param sessionId the connection the command came from; only matters for {@code ENDED} */
    public synchronized boolean apply(RoomCommand cmd, String sessionId) {
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
                // The reporter sends the track's length. If the room is not there yet, their clock runs
                // ahead; they will report again, and nobody else's song is cut short.
                if (cmd.position() != null && playing && livePosition() < cmd.position() - END_TOLERANCE_SECONDS) return false;
                // A listener who fell behind still has the last moments to hear. Wait until every
                // listener has finished (they keep reporting), but not for long.
                if (sessionId != null && sessions.containsKey(sessionId)) {
                    long now = System.currentTimeMillis();
                    finished.add(sessionId);
                    if (finishBy == 0) finishBy = now + END_GRACE_MILLIS;
                    if (!finished.containsAll(sessions.keySet()) && now < finishBy) return false;
                }
                if (!advance()) return false;
            }
            case "PREV" -> {
                if (songId == null) return false;
                if (livePosition() > 3) start(songId);
                else start(catalog.neighbour(songId, -1));
            }
            case "SHUFFLE" -> {
                boolean on = cmd.index() == null ? !shuffle : cmd.index() != 0;
                if (on == shuffle) return false;
                shuffle = on;
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
        if (cmd.type().equals("SHUFFLE") || (cmd.type().startsWith("QUEUE_") && !cmd.type().equals("QUEUE_PLAY"))) {
            version++; // the queue changed, playback did not: its position and clock stay exactly as they were
        } else {
            touch();
        }
        return true;
    }

    private boolean advance() {
        Integer next = !queue.isEmpty() ? queue.remove(0) : shuffle ? catalog.randomId(songId) : catalog.neighbour(songId, 1);
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
        finished.clear();
        finishBy = 0;
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
