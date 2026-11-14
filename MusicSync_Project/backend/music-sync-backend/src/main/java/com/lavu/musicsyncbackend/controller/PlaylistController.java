package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.auth.ApiException;
import com.lavu.musicsyncbackend.auth.AuthInterceptor;
import com.lavu.musicsyncbackend.auth.AuthUser;
import com.lavu.musicsyncbackend.model.Friendship;
import com.lavu.musicsyncbackend.model.FriendshipRepository;
import com.lavu.musicsyncbackend.model.Playlist;
import com.lavu.musicsyncbackend.model.PlaylistShare;
import com.lavu.musicsyncbackend.model.PlaylistShareRepository;
import com.lavu.musicsyncbackend.model.User;
import com.lavu.musicsyncbackend.model.UserRepository;
import com.lavu.musicsyncbackend.model.PlaylistRepository;
import com.lavu.musicsyncbackend.model.PlaylistSong;
import com.lavu.musicsyncbackend.model.PlaylistSongRepository;
import com.lavu.musicsyncbackend.model.Song;
import com.lavu.musicsyncbackend.service.SongCatalog;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Each user's own playlists, kept in the database. */
@RestController
@RequestMapping("/api/playlists")
public class PlaylistController {

    private static final int MAX_PLAYLISTS = 50;
    private static final int MAX_SONGS = 500;
    private static final int MAX_NAME = 60;

    /** @param id the song's id in today's library, or null if the library no longer has it */
    public record Item(long itemId, Integer id, String title, String artist, String url, String thumbnail,
                       String category, int duration) {}
    public record View(long id, String name, List<Item> songs) {}
    public record NameRequest(String name) {}
    public record SongRequest(Integer songId) {}
    public record ShareRequest(String username) {}
    /** A playlist a friend has offered: accept it to get your own copy. */
    public record Shared(long shareId, String from, String name, long count, String cover) {}

    private final PlaylistRepository playlists;
    private final PlaylistSongRepository songs;
    private final SongCatalog catalog;
    private final PlaylistShareRepository shares;
    private final UserRepository users;
    private final FriendshipRepository friendships;

    public PlaylistController(PlaylistRepository playlists, PlaylistSongRepository songs, SongCatalog catalog,
                              PlaylistShareRepository shares, UserRepository users, FriendshipRepository friendships) {
        this.playlists = playlists;
        this.songs = songs;
        this.catalog = catalog;
        this.shares = shares;
        this.users = users;
        this.friendships = friendships;
    }

    @GetMapping
    public List<View> list(@RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        List<Playlist> mine = playlists.findByUserIdOrderByIdAsc(me.id());
        Map<Long, List<Item>> items = new HashMap<>();
        for (PlaylistSong song : songs.findByPlaylistIdInOrderByIdAsc(mine.stream().map(Playlist::getId).toList())) {
            items.computeIfAbsent(song.getPlaylistId(), k -> new ArrayList<>()).add(item(song));
        }
        return mine.stream().map(p -> new View(p.getId(), p.getName(), items.getOrDefault(p.getId(), List.of()))).toList();
    }

    @PostMapping
    public View create(@RequestBody NameRequest body, @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        if (playlists.countByUserId(me.id()) >= MAX_PLAYLISTS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You've reached the limit of " + MAX_PLAYLISTS + " playlists");
        }
        Playlist playlist = playlists.save(new Playlist(me.id(), name(body)));
        return new View(playlist.getId(), playlist.getName(), List.of());
    }

    @PutMapping("/{id}")
    public Map<String, Object> rename(@PathVariable long id, @RequestBody NameRequest body,
                                      @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        Playlist playlist = own(id, me);
        playlist.setName(name(body));
        playlists.save(playlist);
        return Map.of("id", playlist.getId(), "name", playlist.getName());
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable long id, @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        Playlist playlist = own(id, me);
        songs.deleteByPlaylistId(playlist.getId());
        shares.deleteByPlaylistId(playlist.getId());
        playlists.delete(playlist);
        return Map.of("ok", true);
    }

    @PostMapping("/{id}/songs")
    public Item addSong(@PathVariable long id, @RequestBody SongRequest body,
                        @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        Playlist playlist = own(id, me);
        Song song = body == null ? null : catalog.byId(body.songId());
        if (song == null) throw new ApiException(HttpStatus.NOT_FOUND, "That song isn't in the library any more");
        if (songs.existsByPlaylistIdAndUrl(playlist.getId(), song.getUrl())) {
            throw new ApiException(HttpStatus.CONFLICT, "Already in " + playlist.getName());
        }
        if (songs.countByPlaylistId(playlist.getId()) >= MAX_SONGS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This playlist is full (" + MAX_SONGS + " songs)");
        }
        return item(songs.save(new PlaylistSong(playlist.getId(), song)));
    }

    @DeleteMapping("/{id}/songs/{itemId}")
    public Map<String, Boolean> removeSong(@PathVariable long id, @PathVariable long itemId,
                                           @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        Playlist playlist = own(id, me);
        songs.findByIdAndPlaylistId(itemId, playlist.getId()).ifPresent(songs::delete);
        return Map.of("ok", true);
    }

    /** Offers one of your playlists to a friend. */
    @PostMapping("/{id}/share")
    public Map<String, Boolean> share(@PathVariable long id, @RequestBody ShareRequest body,
                                      @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        Playlist playlist = own(id, me);
        String key = body == null || body.username() == null ? "" : body.username().trim().replaceAll("\\s+", " ").toLowerCase();
        User friend = users.findByUsername(key)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Nobody has that username"));
        boolean friends = friendships.findByRequesterIdAndAddresseeId(me.id(), friend.getId()).filter(Friendship::isAccepted).isPresent()
                || friendships.findByRequesterIdAndAddresseeId(friend.getId(), me.id()).filter(Friendship::isAccepted).isPresent();
        if (!friends) throw new ApiException(HttpStatus.FORBIDDEN, "You can only share playlists with your friends");
        if (!shares.existsByPlaylistIdAndToUserId(playlist.getId(), friend.getId())) {
            shares.save(new PlaylistShare(playlist.getId(), me.id(), friend.getId()));
        }
        return Map.of("ok", true);
    }

    /** Playlists friends have shared with you that you have not answered yet. */
    @GetMapping("/shared")
    public List<Shared> shared(@RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        List<Shared> result = new ArrayList<>();
        for (PlaylistShare share : shares.findByToUserIdOrderByIdDesc(me.id())) {
            Playlist playlist = playlists.findById(share.getPlaylistId()).orElse(null);
            User from = users.findById(share.getFromUserId()).orElse(null);
            if (playlist == null || from == null) {
                shares.delete(share); // the playlist was deleted since
                continue;
            }
            List<PlaylistSong> items = songs.findByPlaylistIdOrderByIdAsc(playlist.getId());
            result.add(new Shared(share.getId(), from.getDisplayName(), playlist.getName(), items.size(),
                    items.isEmpty() ? "" : items.get(0).getThumbnail()));
        }
        return result;
    }

    /** Copies the shared playlist, as it is now, into your own playlists. */
    @PostMapping("/shared/{shareId}/accept")
    public View accept(@PathVariable long shareId, @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        PlaylistShare share = shares.findByIdAndToUserId(shareId, me.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "That shared playlist is no longer available"));
        Playlist source = playlists.findById(share.getPlaylistId()).orElse(null);
        if (source == null) {
            shares.delete(share);
            throw new ApiException(HttpStatus.NOT_FOUND, "That shared playlist is no longer available");
        }
        if (playlists.countByUserId(me.id()) >= MAX_PLAYLISTS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You've reached the limit of " + MAX_PLAYLISTS + " playlists");
        }
        Playlist copy = playlists.save(new Playlist(me.id(), source.getName()));
        List<Item> items = new ArrayList<>();
        for (PlaylistSong song : songs.findByPlaylistIdOrderByIdAsc(source.getId())) {
            items.add(item(songs.save(PlaylistSong.copyOf(song, copy.getId()))));
        }
        shares.delete(share);
        return new View(copy.getId(), copy.getName(), items);
    }

    @DeleteMapping("/shared/{shareId}")
    public Map<String, Boolean> decline(@PathVariable long shareId, @RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser me) {
        shares.findByIdAndToUserId(shareId, me.id()).ifPresent(shares::delete);
        return Map.of("ok", true);
    }

    private Playlist own(long id, AuthUser me) {
        return playlists.findByIdAndUserId(id, me.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "That playlist doesn't exist"));
    }

    private static String name(NameRequest body) {
        String name = body == null || body.name() == null ? "" : body.name().trim().replaceAll("\\s+", " ");
        if (name.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Give the playlist a name");
        if (name.length() > MAX_NAME) throw new ApiException(HttpStatus.BAD_REQUEST, "Keep the name under " + MAX_NAME + " characters");
        return name;
    }

    private Item item(PlaylistSong s) {
        return new Item(s.getId(), catalog.idByUrl(s.getUrl()), s.getTitle(), s.getArtist(), s.getUrl(), s.getThumbnail(),
                s.getCategory(), s.getDuration());
    }
}
