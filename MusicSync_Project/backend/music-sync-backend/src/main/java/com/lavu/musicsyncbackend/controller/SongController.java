package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.model.Song;
import jakarta.annotation.PostConstruct;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import java.util.*;

@RestController
@RequestMapping("/api")
public class SongController {

    private static final String[][] TAMIL_QUERIES = {
            { "Tamil Hits", "Hits" },
            { "Tamil Love Songs", "Love Songs" },
            { "Tamil Mass Songs", "Mass Songs" },
            { "Tamil BGM", "BGM" },
            { "Anirudh Ravichander", "Anirudh" },
            { "AR Rahman Tamil", "AR Rahman" },
            { "Tamil 2024", "2024 Hits" },
            { "Tamil 2023", "2023 Hits" },
            { "Tamil 2022", "2022 Hits" },
            { "Tamil Kuthu Songs", "Kuthu" },
            { "Tamil Melody Songs", "Melody" },
            { "Tamil Sad Songs", "Sad Songs" },
            { "Yuvan Shankar Raja", "Yuvan" },
            { "Vijay Antony Songs", "Vijay Antony" },
            { "Harris Jayaraj Tamil", "Harris Jayaraj" },
            { "Tamil Folk Songs", "Folk" },
            { "Tamil Devotional", "Devotional" },
            { "Tamil 90s Hits", "90s Hits" },
            { "Tamil 2000s Hits", "2000s Hits" }
    };

    private static final int PAGES_PER_QUERY = 3;
    private static final int LIMIT_PER_PAGE  = 100;

    // Cached in memory — loaded once at startup
    private List<Song> cachedPlaylist = new ArrayList<>();

    @PostConstruct
    public void loadPlaylist() {
        System.out.println("🎵 Loading Tamil playlist in background...");
        new Thread(() -> {
            List<Song> playlist = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            RestTemplate restTemplate = new RestTemplate();

            for (String[] entry : TAMIL_QUERIES) {
                String query = entry[0];
                String category = entry[1];
                for (int page = 1; page <= PAGES_PER_QUERY; page++) {
                    try {
                        String url = "https://saavn.sumit.co/api/search/songs?query="
                                + query.replace(" ", "%20")
                                + "&limit=" + LIMIT_PER_PAGE + "&page=" + page;
                        @SuppressWarnings("unchecked")
                        Map<String, Object> response = restTemplate.getForObject(url, Map.class);

                        if (response == null || response.get("data") == null) continue;
                        @SuppressWarnings("unchecked")
                        Map<String, Object> data = (Map<String, Object>) response.get("data");
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> results = (List<Map<String, Object>>) data.get("results");
                        if (results == null) continue;

                        for (Map<String, Object> item : results) {
                            String name = (String) item.get("name");
                            if (name == null || seen.contains(name.toLowerCase())) continue;

                            @SuppressWarnings("unchecked")
                            List<Map<String, Object>> images = (List<Map<String, Object>>) item.get("image");
                            @SuppressWarnings("unchecked")
                            List<Map<String, Object>> downloads = (List<Map<String, Object>>) item.get("downloadUrl");
                            if (images == null || images.isEmpty() || downloads == null || downloads.isEmpty()) continue;

                            String artist = "";
                            try {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> artistsObj = (Map<String, Object>) item.get("artists");
                                if (artistsObj != null) {
                                    @SuppressWarnings("unchecked")
                                    List<Map<String, Object>> primary = (List<Map<String, Object>>) artistsObj.get("primary");
                                    if (primary != null) {
                                        StringBuilder sb = new StringBuilder();
                                        for (Map<String, Object> a : primary) {
                                            if (sb.length() > 0) sb.append(", ");
                                            sb.append((String) a.get("name"));
                                        }
                                        artist = sb.toString();
                                    }
                                }
                            } catch (Exception ignored) {}

                            seen.add(name.toLowerCase());
                            playlist.add(new Song(
                                    playlist.size() + 1,
                                    name,
                                    artist,
                                    (String) downloads.get(downloads.size() - 1).get("url"),
                                    (String) images.get(images.size() - 1).get("url"),
                                    category));
                        }
                    } catch (Exception e) {
                        System.err.println("⚠️ Failed: " + query + " page " + page);
                    }
                }
            }

            if (playlist.isEmpty()) {
                playlist.add(new Song(1, "Enjoy Enjaami", "Dhee",
                        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
                        "https://via.placeholder.com/150", "Hits"));
                playlist.add(new Song(2, "Vaathi Coming", "Anirudh",
                        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
                        "https://via.placeholder.com/150", "Hits"));
            }

            cachedPlaylist = playlist;
            System.out.println("✅ Playlist loaded: " + playlist.size() + " songs");
        }).start();
    }

    @GetMapping("/songs")
    public List<Song> getPlaylist() {
        return cachedPlaylist;
    }
}
