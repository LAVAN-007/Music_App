package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.auth.ApiException;
import com.lavu.musicsyncbackend.auth.AuthInterceptor;
import com.lavu.musicsyncbackend.auth.AuthUser;
import com.lavu.musicsyncbackend.room.ChatMessage;
import com.lavu.musicsyncbackend.room.Room;
import com.lavu.musicsyncbackend.room.RoomService;
import com.lavu.musicsyncbackend.room.RoomState;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    public record RoomInfo(String code, String createdBy, List<String> users, List<ChatMessage> messages,
                           RoomState state, long serverTime) {}

    private final RoomService rooms;

    public RoomController(RoomService rooms) {
        this.rooms = rooms;
    }

    @PostMapping
    public RoomInfo create(@RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser user) {
        Room room = rooms.create(user.username());
        if (room == null) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Too many rooms right now. Try again later.");
        return info(room);
    }

    @GetMapping("/{code}")
    public RoomInfo get(@PathVariable String code) {
        Room room = rooms.get(code);
        if (room == null) throw new ApiException(HttpStatus.NOT_FOUND, "That room doesn't exist or has ended");
        return info(room);
    }

    private static RoomInfo info(Room room) {
        return new RoomInfo(room.getCode(), room.getCreatedBy(), room.users(), room.messages(), room.state(),
                System.currentTimeMillis());
    }
}
