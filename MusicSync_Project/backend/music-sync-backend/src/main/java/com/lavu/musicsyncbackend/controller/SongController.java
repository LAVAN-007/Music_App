package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.model.Song;
import com.lavu.musicsyncbackend.service.SongCatalog;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SongController {

    public record Library(boolean loading, List<Song> songs) {}

    private final SongCatalog catalog;

    public SongController(SongCatalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/songs")
    public Library songs() {
        // Read the flag first: if loading finishes in between, the client simply polls once more.
        boolean loading = catalog.isLoading();
        return new Library(loading, catalog.all());
    }

    /** Lets clients estimate their clock offset from the server. */
    @GetMapping("/time")
    public Map<String, Long> time() {
        return Map.of("now", System.currentTimeMillis());
    }
}
