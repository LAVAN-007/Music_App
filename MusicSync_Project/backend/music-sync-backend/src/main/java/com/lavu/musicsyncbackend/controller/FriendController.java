package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.auth.ApiException;
import com.lavu.musicsyncbackend.auth.AuthInterceptor;
import com.lavu.musicsyncbackend.auth.AuthUser;
import com.lavu.musicsyncbackend.auth.Presence;
import com.lavu.musicsyncbackend.model.Friendship;
import com.lavu.musicsyncbackend.model.FriendshipRepository;
import com.lavu.musicsyncbackend.model.User;
import com.lavu.musicsyncbackend.model.UserRepository;
import com.lavu.musicsyncbackend.room.RoomService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Friend requests and the friends list. People are addressed by username. */
@RestController
@RequestMapping("/api/friends")
public class FriendController {

    private static final int MAX_FRIENDS = 300;

    public record Friend(String username, boolean online, String room) {}
    public record Overview(List<Friend> friends, List<String> incoming, List<String> outgoing) {}
    public record Found(String username, String relation) {}
    public record Target(String username) {}

    private final FriendshipRepository friendships;
    private final UserRepository users;
    private final Presence presence;
    private final RoomService rooms;

    public FriendController(FriendshipRepository friendships, UserRepository users, Presence presence, RoomService rooms) {
        this.friendships = friendships;
        this.users = users;
        this.presence = presence;
        this.rooms = rooms;
    }

    @GetMapping
    public Overview overview(@RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        List<Friendship> all = friendships.findByRequesterIdOrAddresseeIdOrderByIdAsc(me.id(), me.id());
        Map<Long, User> people = people(all, me);
        Map<String, String> roomOf = rooms.roomsByUser();
        List<Friend> friends = new ArrayList<>();
        List<String> incoming = new ArrayList<>();
        List<String> outgoing = new ArrayList<>();
        for (Friendship f : all) {
            boolean mine = f.getRequesterId().equals(me.id());
            User other = people.get(mine ? f.getAddresseeId() : f.getRequesterId());
            if (other == null) continue;
            String name = other.getDisplayName();
            if (f.isAccepted()) {
                String room = roomOf.get(name);
                friends.add(new Friend(name, room != null || presence.isOnline(other.getId()), room));
            } else if (mine) {
                outgoing.add(name);
            } else {
                incoming.add(name);
            }
        }
        // Listening friends first, then online, then by name.
        friends.sort((a, b) -> {
            int rank = Integer.compare(rank(a), rank(b));
            return rank != 0 ? rank : a.username().compareToIgnoreCase(b.username());
        });
        return new Overview(friends, incoming, outgoing);
    }

    @GetMapping("/search")
    public List<Found> search(@RequestParam String q, @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        String part = q == null ? "" : q.trim().toLowerCase();
        if (part.length() < 2) return List.of();
        Map<Long, String> relation = new HashMap<>();
        for (Friendship f : friendships.findByRequesterIdOrAddresseeIdOrderByIdAsc(me.id(), me.id())) {
            boolean mine = f.getRequesterId().equals(me.id());
            relation.put(mine ? f.getAddresseeId() : f.getRequesterId(), f.isAccepted() ? "friend" : mine ? "outgoing" : "incoming");
        }
        List<Found> found = new ArrayList<>();
        for (User user : users.findTop8ByUsernameContainingOrderByUsernameAsc(part)) {
            if (user.getId().equals(me.id())) continue;
            found.add(new Found(user.getDisplayName(), relation.getOrDefault(user.getId(), "none")));
        }
        return found;
    }

    /** Sends a friend request. If that person already asked you, this accepts theirs. */
    @PostMapping
    public Map<String, String> add(@RequestBody Target body, @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        User other = find(body, me);
        Optional<Friendship> theirs = friendships.findByRequesterIdAndAddresseeId(other.getId(), me.id());
        if (theirs.isPresent()) {
            theirs.get().setAccepted(true);
            friendships.save(theirs.get());
            return Map.of("status", "friend");
        }
        Optional<Friendship> mine = friendships.findByRequesterIdAndAddresseeId(me.id(), other.getId());
        if (mine.isPresent()) return Map.of("status", mine.get().isAccepted() ? "friend" : "outgoing");
        if (friendships.findByRequesterIdOrAddresseeIdOrderByIdAsc(me.id(), me.id()).size() >= MAX_FRIENDS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Your friends list is full");
        }
        try {
            friendships.save(new Friendship(me.id(), other.getId()));
        } catch (DataIntegrityViolationException e) { /* asked twice at once: already recorded */ }
        return Map.of("status", "outgoing");
    }

    @PostMapping("/accept")
    public Map<String, String> accept(@RequestBody Target body, @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        User other = find(body, me);
        Friendship request = friendships.findByRequesterIdAndAddresseeId(other.getId(), me.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "That request is no longer there"));
        request.setAccepted(true);
        friendships.save(request);
        return Map.of("status", "friend");
    }

    /** Removes a friend, declines a request or cancels one you sent. */
    @PostMapping("/remove")
    public Map<String, String> remove(@RequestBody Target body, @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        User other = find(body, me);
        friendships.findByRequesterIdAndAddresseeId(me.id(), other.getId()).ifPresent(friendships::delete);
        friendships.findByRequesterIdAndAddresseeId(other.getId(), me.id()).ifPresent(friendships::delete);
        return Map.of("status", "none");
    }

    private User find(Target body, AuthUser me) {
        String key = body == null || body.username() == null ? "" : body.username().trim().replaceAll("\\s+", " ").toLowerCase();
        User other = users.findByUsername(key)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Nobody has that username"));
        if (other.getId().equals(me.id())) throw new ApiException(HttpStatus.BAD_REQUEST, "That's you!");
        return other;
    }

    private Map<Long, User> people(List<Friendship> all, AuthUser me) {
        List<Long> ids = new ArrayList<>();
        for (Friendship f : all) ids.add(f.getRequesterId().equals(me.id()) ? f.getAddresseeId() : f.getRequesterId());
        Map<Long, User> people = new HashMap<>();
        for (User user : users.findAllById(ids)) people.put(user.getId(), user);
        return people;
    }

    private static int rank(Friend f) {
        return f.room() != null ? 0 : f.online() ? 1 : 2;
    }
}
