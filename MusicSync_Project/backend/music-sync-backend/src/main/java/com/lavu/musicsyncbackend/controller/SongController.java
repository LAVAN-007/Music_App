package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.model.Song;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import java.util.*;

@RestController
@RequestMapping("/api")
public class SongController {

    private static List<Song> cachedPlaylist = new ArrayList<>();

    @SuppressWarnings("unchecked")
    @GetMapping("/songs")
    public List<Song> getPlaylist() {
        if (!cachedPlaylist.isEmpty()) {
            System.out.println("🚀 Returning from Cache! Total: " + cachedPlaylist.size());
            return cachedPlaylist;
        }

        List<Song> playlist = new ArrayList<>();
        RestTemplate restTemplate = new RestTemplate();
        Set<String> uniqueUrls = new HashSet<>();
        int count = 1;

        String[] categories = {
                "Tamil%20Hits", "Tamil%20Melody", "A.R.%20Rahman", "Anirudh%20Hits",
                "Yuvan%20Shankar%20Raja", "Ilayaraja%20Hits", "S.P.%20Balasubrahmanyam",
                "S.%20Janaki%20Hits", "D.%20Imman%20Hits", "Karthik%20Singer", "Tamil%2080s%2090s"
        };

        for (String query : categories) {
            for (int page = 0; page < 8; page++) {
                try {
                    String url = "https://saavn.sumit.co/api/search/songs?query=" + query + "&limit=40&page=" + page;
                    Map<String, Object> response = restTemplate.getForObject(url, Map.class);

                    if (response != null && response.get("data") != null) {
                        Map<String, Object> data = (Map<String, Object>) response.get("data");
                        List<Map<String, Object>> songResults = (List<Map<String, Object>>) data.get("results");

                        if (songResults != null) {
                            for (Map<String, Object> item : songResults) {
                                List<Map<String, String>> images = (List<Map<String, String>>) item.get("image");
                                List<Map<String, String>> downloads = (List<Map<String, String>>) item.get("downloadUrl");

                                if (images != null && !images.isEmpty() && downloads != null && !downloads.isEmpty()) {
                                    String songUrl = downloads.get(downloads.size() - 1).get("url");

                                    if (!uniqueUrls.contains(songUrl)) {
                                        uniqueUrls.add(songUrl);
                                        playlist.add(new Song(
                                                count++,
                                                (String) item.get("name"),
                                                (String) item.get("primaryArtists"),
                                                songUrl,
                                                images.get(images.size() - 1).get("url")
                                        ));
                                    }
                                }
                            }
                        }
                    }
                    if (playlist.size() >= 2500) break;

                } catch (Exception e) {
                    System.err.println("⚠️ Error on page " + page + ": " + e.getMessage());
                }
            }
            if (playlist.size() >= 2500) break;
        }
        cachedPlaylist = playlist;
        System.out.println("✅ Library Built Successfully. Total Songs: " + playlist.size());
        return playlist;
    }
}