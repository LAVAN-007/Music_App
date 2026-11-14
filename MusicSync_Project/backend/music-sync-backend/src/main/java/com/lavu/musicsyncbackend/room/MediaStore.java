package com.lavu.musicsyncbackend.room;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Pictures sent in room chats. Like rooms, they live in memory: the oldest are dropped once the
 * store is full, and a restart clears them. Ids are long random strings, so a picture can only
 * be opened by someone who was sent its message.
 */
@Component
public class MediaStore {

    public static final int MAX_IMAGE_BYTES = 1_500_000;
    private static final long MAX_TOTAL_BYTES = 80L * 1024 * 1024;
    private static final int MAX_IMAGES = 400;

    public record Media(byte[] data, String type, String room) {}

    private final LinkedHashMap<String, Media> images = new LinkedHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private long totalBytes;

    /** @return the new picture's id, or null if the bytes are not a JPEG, PNG, GIF or WebP image */
    public synchronized String put(String room, byte[] data) {
        String type = typeOf(data);
        if (type == null) return null;
        byte[] raw = new byte[18];
        random.nextBytes(raw);
        String id = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        images.put(id, new Media(data, type, room));
        totalBytes += data.length;
        Iterator<Map.Entry<String, Media>> oldest = images.entrySet().iterator();
        while ((totalBytes > MAX_TOTAL_BYTES || images.size() > MAX_IMAGES) && oldest.hasNext()) {
            totalBytes -= oldest.next().getValue().data().length;
            oldest.remove();
        }
        return id;
    }

    public synchronized Media get(String id) {
        return id == null ? null : images.get(id);
    }

    public synchronized boolean belongsTo(String id, String room) {
        Media media = get(id);
        return media != null && media.room().equals(room);
    }

    /** Decided from the file's first bytes, never from what the uploader claims. */
    static String typeOf(byte[] d) {
        if (d == null || d.length < 12) return null;
        if ((d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8 && (d[2] & 0xFF) == 0xFF) return "image/jpeg";
        if ((d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G') return "image/png";
        if (d[0] == 'G' && d[1] == 'I' && d[2] == 'F' && d[3] == '8') return "image/gif";
        if (d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') return "image/webp";
        return null;
    }
}
