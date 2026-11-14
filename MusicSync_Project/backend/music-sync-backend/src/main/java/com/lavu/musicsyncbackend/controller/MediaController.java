package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.auth.ApiException;
import com.lavu.musicsyncbackend.auth.AuthInterceptor;
import com.lavu.musicsyncbackend.auth.AuthUser;
import com.lavu.musicsyncbackend.room.MediaStore;
import com.lavu.musicsyncbackend.room.Room;
import com.lavu.musicsyncbackend.room.RoomService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.TimeUnit;

/** Pictures for room chats: upload one, then send its id in a chat message. */
@RestController
@RequestMapping("/api")
public class MediaController {

    private final MediaStore media;
    private final RoomService rooms;

    public MediaController(MediaStore media, RoomService rooms) {
        this.media = media;
        this.rooms = rooms;
    }

    @PostMapping("/rooms/{code}/images")
    public Map<String, String> upload(@PathVariable String code, @RequestBody(required = false) byte[] body,
                                      @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        Room room = rooms.get(code);
        if (room == null) throw new ApiException(HttpStatus.NOT_FOUND, "That room doesn't exist or has ended");
        if (!room.users().contains(me.username())) throw new ApiException(HttpStatus.FORBIDDEN, "Join the room to send pictures");
        if (body == null || body.length == 0) throw new ApiException(HttpStatus.BAD_REQUEST, "No picture was sent");
        if (body.length > MediaStore.MAX_IMAGE_BYTES) throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "That picture is too large");
        String id = media.put(room.getCode(), body);
        if (id == null) throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG, PNG, GIF or WebP pictures can be sent");
        return Map.of("id", id);
    }

    /** Not behind sign-in so an img tag can load it; the long random id is the key. */
    @GetMapping("/media/{id}")
    public ResponseEntity<byte[]> get(@PathVariable String id) {
        MediaStore.Media image = media.get(id);
        if (image == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.type()))
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Disposition", "inline")
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePrivate())
                .body(image.data());
    }
}
