package com.lavu.musicsyncbackend.service;

import com.lavu.musicsyncbackend.model.Song;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The song library. Loaded once from the remote search API, published progressively
 * while loading, and cached on disk so restarts are instant.
 */
@Service
public class SongCatalog {

    private static final String[][] QUERIES = {
            {"Tamil Hits", "Hits"},
            {"Tamil Love Songs", "Love Songs"},
            {"Tamil Mass Songs", "Mass Songs"},
            {"Tamil BGM", "BGM"},
            {"Anirudh Ravichander", "Anirudh"},
            {"AR Rahman Tamil", "AR Rahman"},
            {"Tamil 2024", "2024 Hits"},
            {"Tamil 2023", "2023 Hits"},
            {"Tamil 2022", "2022 Hits"},
            {"Tamil Kuthu Songs", "Kuthu"},
            {"Tamil Melody Songs", "Melody"},
            {"Tamil Sad Songs", "Sad Songs"},
            {"Yuvan Shankar Raja", "Yuvan"},
            {"Vijay Antony Songs", "Vijay Antony"},
            {"Harris Jayaraj Tamil", "Harris Jayaraj"},
            {"Tamil Folk Songs", "Folk"},
            {"Tamil Devotional", "Devotional"},
            {"Tamil 90s Hits", "90s Hits"},
            {"Tamil 2000s Hits", "2000s Hits"}
    };
    private static final int PAGES_PER_QUERY = 3;
    private static final int LIMIT_PER_PAGE = 100;
    private static final long CACHE_TTL_MS = 24L * 60 * 60 * 1000;

    private final ObjectMapper mapper;
    private final boolean remote;
    private final String apiBase;
    private final Path cacheFile;

    // Song ids are 1-based positions in this list, so lookups are index reads.
    private volatile List<Song> songs = List.of();
    private volatile boolean loading = true;
    private volatile Map<String, Integer> urlIndex = Map.of();
    private volatile List<Song> indexedList;

    public SongCatalog(ObjectMapper mapper,
                       @Value("${musicsync.catalog.remote:true}") boolean remote,
                       @Value("${musicsync.catalog.api:https://saavn.sumit.co/api}") String apiBase,
                       @Value("${musicsync.catalog.cache-file:./data/catalog.json}") String cacheFile) {
        this.mapper = mapper;
        this.remote = remote;
        this.apiBase = apiBase;
        this.cacheFile = Path.of(cacheFile);
    }

    @PostConstruct
    void start() {
        if (!remote) {
            songs = demoSongs();
            loading = false;
            return;
        }
        List<Song> cached = readCache();
        boolean fresh = false;
        if (!cached.isEmpty()) {
            songs = cached;
            try {
                fresh = System.currentTimeMillis() - Files.getLastModifiedTime(cacheFile).toMillis() < CACHE_TTL_MS;
            } catch (Exception ignored) {}
        }
        if (fresh) {
            loading = false;
            System.out.println("Catalog: " + cached.size() + " songs from cache");
            return;
        }
        // A stale cache keeps serving (ids stay stable for this run); it is refreshed for the next start.
        boolean serveWhileLoading = cached.isEmpty();
        loading = serveWhileLoading;
        Thread t = new Thread(() -> fetchAll(serveWhileLoading), "catalog-loader");
        t.setDaemon(true);
        t.start();
    }

    public List<Song> all() {
        return songs;
    }

    public boolean isLoading() {
        return loading;
    }

    public Song byId(Integer id) {
        List<Song> list = songs;
        if (id == null || id < 1 || id > list.size()) return null;
        return list.get(id - 1);
    }

    /** Finds a song saved earlier (in a playlist) in today's library, by its audio address. */
    public Integer idByUrl(String url) {
        List<Song> list = songs;
        Map<String, Integer> index = urlIndex;
        if (indexedList != list) {
            index = new java.util.HashMap<>();
            for (Song song : list) index.putIfAbsent(song.getUrl(), song.getId());
            urlIndex = index;
            indexedList = list;
        }
        return index.get(url);
    }

    public Integer firstId() {
        return songs.isEmpty() ? null : 1;
    }

    /** The id {@code step} places after (or before) {@code id}, wrapping around the library. */
    public Integer neighbour(Integer id, int step) {
        int size = songs.size();
        if (size == 0) return null;
        if (id == null) return 1;
        return Math.floorMod(id - 1 + step, size) + 1;
    }

    private void fetchAll(boolean publishProgress) {
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        List<Song> list = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String[] entry : QUERIES) {
            for (int page = 1; page <= PAGES_PER_QUERY; page++) {
                try {
                    String url = apiBase + "/search/songs?query=" + URLEncoder.encode(entry[0], StandardCharsets.UTF_8)
                            + "&limit=" + LIMIT_PER_PAGE + "&page=" + page;
                    HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                            .timeout(Duration.ofSeconds(20)).GET().build();
                    HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
                    if (response.statusCode() != 200) throw new IllegalStateException("HTTP " + response.statusCode());
                    int added = parsePage(response.body(), entry[1], list, seen);
                    if (added < 0) break; // no more results for this query
                } catch (Exception e) {
                    System.err.println("Catalog: failed \"" + entry[0] + "\" page " + page + ": " + e.getMessage());
                }
            }
            if (publishProgress && !list.isEmpty()) songs = List.copyOf(list);
        }
        if (list.isEmpty()) {
            if (songs.isEmpty()) songs = demoSongs();
            System.err.println("Catalog: remote API unreachable, serving " + songs.size() + " songs");
        } else {
            if (publishProgress) songs = List.copyOf(list);
            writeCache(list);
            System.out.println("Catalog: " + list.size() + " songs loaded");
        }
        loading = false;
    }

    /** @return number of songs added, or -1 when the page had no results at all */
    @SuppressWarnings("unchecked")
    private int parsePage(String body, String category, List<Song> list, Set<String> seen) {
        Map<String, Object> root = mapper.readValue(body, Map.class);
        Object data = root.get("data");
        if (!(data instanceof Map<?, ?> dataMap)) return -1;
        Object results = dataMap.get("results");
        if (!(results instanceof List<?> items) || items.isEmpty()) return -1;

        int added = 0;
        for (Object raw : items) {
            if (!(raw instanceof Map<?, ?>)) continue;
            Map<String, Object> item = (Map<String, Object>) raw;
            String title = unescape(str(item.get("name")));
            String url = lastUrl(item.get("downloadUrl"));
            if (title.isEmpty() || url == null) continue;

            StringBuilder artist = new StringBuilder();
            if (item.get("artists") instanceof Map<?, ?> artists && artists.get("primary") instanceof List<?> primary) {
                for (Object a : primary) {
                    if (a instanceof Map<?, ?> am && am.get("name") != null) {
                        if (artist.length() > 0) artist.append(", ");
                        artist.append(unescape(str(am.get("name"))));
                    }
                }
            }
            String key = (title + "|" + artist).toLowerCase();
            if (!seen.add(key)) continue;

            int duration = item.get("duration") instanceof Number n ? n.intValue() : 0;
            String image = lastUrl(item.get("image"));
            list.add(new Song(list.size() + 1, title, artist.toString(), url, image == null ? "" : image, category, duration));
            added++;
        }
        return added;
    }

    /** Entries are ordered lowest to highest quality; take the best. */
    private static String lastUrl(Object value) {
        if (!(value instanceof List<?> list) || list.isEmpty()) return null;
        Object last = list.get(list.size() - 1);
        if (last instanceof Map<?, ?> m && m.get("url") instanceof String s && !s.isBlank()) {
            return s.startsWith("http://") ? "https://" + s.substring(7) : s;
        }
        return null;
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString().trim();
    }

    private static String unescape(String s) {
        return s.replace("&quot;", "\"").replace("&#039;", "'").replace("&#39;", "'")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    }

    private List<Song> readCache() {
        try {
            if (!Files.exists(cacheFile)) return List.of();
            Song[] cached = mapper.readValue(Files.readString(cacheFile), Song[].class);
            return List.of(cached);
        } catch (Exception e) {
            System.err.println("Catalog: ignoring unreadable cache: " + e.getMessage());
            return List.of();
        }
    }

    private void writeCache(List<Song> list) {
        try {
            if (cacheFile.getParent() != null) Files.createDirectories(cacheFile.getParent());
            Path tmp = cacheFile.resolveSibling(cacheFile.getFileName() + ".tmp");
            Files.writeString(tmp, mapper.writeValueAsString(list));
            Files.move(tmp, cacheFile, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            System.err.println("Catalog: could not write cache: " + e.getMessage());
        }
    }

    /** Royalty-free tracks used when the remote library is disabled or unreachable. */
    private static List<Song> demoSongs() {
        List<Song> demo = new ArrayList<>();
        for (int i = 1; i <= 8; i++) {
            demo.add(new Song(i, "SoundHelix Song " + i, "T. Schürger",
                    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-" + i + ".mp3", "", "Demo", 0));
        }
        return List.copyOf(demo);
    }
}
