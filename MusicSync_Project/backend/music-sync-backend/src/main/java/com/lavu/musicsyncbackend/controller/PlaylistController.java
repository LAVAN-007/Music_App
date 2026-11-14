package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.auth.ApiException;
import com.lavu.musicsyncbackend.auth.AuthInterceptor;
import com.lavu.musicsyncbackend.auth.AuthUser;
import com.lavu.musicsyncbackend.model.Playlist;
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

    private final PlaylistRepository playlists;
    private final PlaylistSongRepository songs;
    private final SongCatalog catalog;

    public PlaylistController(PlaylistRepository playlists, PlaylistSongRepository songs, SongCatalog catalog) {
        this.playlists = playlists;
        this.songs = songs;
        this.catalog = catalog;
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
