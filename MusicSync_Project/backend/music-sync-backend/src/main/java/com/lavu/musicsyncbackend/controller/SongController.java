package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.model.Song;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import java.util.*;

@RestController
@RequestMapping("/api")
public class SongController {

    @SuppressWarnings("unchecked")
    @GetMapping("/songs")
    public List<Song> getPlaylist() {
        List<Song> playlist = new ArrayList<>();
        try {
            RestTemplate restTemplate = new RestTemplate();
            String jioSaavnUrl = "https://saavn.sumit.co/api/search/songs?query=Tamil%20Hits&limit=1000";
            Map<String, Object> response = restTemplate.getForObject(jioSaavnUrl, Map.class);

            if (response != null && response.get("data") != null) {
                Map<String, Object> data = (Map<String, Object>) response.get("data");
                List<Map<String, Object>> songResults = (List<Map<String, Object>>) data.get("results");

                if (songResults != null) {
                    int count = 1;
                    for (Map<String, Object> item : songResults) {
                        List<Map<String, String>> images = (List<Map<String, String>>) item.get("image");
                        List<Map<String, String>> downloads = (List<Map<String, String>>) item.get("downloadUrl");
                        if (images != null && !images.isEmpty() && downloads != null && !downloads.isEmpty()) {
                            playlist.add(new Song(
                                    count++,
                                    (String) item.get("name"),
                                    (String) item.get("primaryArtists"),
                                    downloads.get(downloads.size() - 1).get("url"),
                                    images.get(images.size() - 1).get("url")
                            ));
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("⚠️ External API Offline. Loading Fallback...");
        }

        // BACKUP: If API fails, return these so the UI never stays empty
        if (playlist.isEmpty()) {
            playlist.add(new Song(1, "Enjoy Enjaami", "Dhee", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", "https://via.placeholder.com/150"));
            playlist.add(new Song(2, "Vaathi Coming", "Anirudh", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", "https://via.placeholder.com/150"));
        }
        return playlist;
    }
}