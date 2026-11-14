package com.lavu.musicsyncbackend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A song saved in a playlist. Library ids change whenever the library is rebuilt, so the song's
 * details are stored here and matched back to the library by its audio address when read.
 */
@Entity
@Table(name = "playlist_songs", indexes = @Index(columnList = "playlistId"))
@Data
@NoArgsConstructor
public class PlaylistSong {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long playlistId;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(nullable = false, length = 500)
    private String artist;

    @Column(nullable = false, length = 1000)
    private String url;

    @Column(nullable = false, length = 1000)
    private String thumbnail;

    @Column(nullable = false, length = 80)
    private String category;

    @Column(nullable = false)
    private int duration;

    public PlaylistSong(Long playlistId, Song song) {
        this.playlistId = playlistId;
        this.title = cut(song.getTitle(), 300);
        this.artist = cut(song.getArtist(), 500);
        this.url = song.getUrl();
        this.thumbnail = cut(song.getThumbnail(), 1000);
        this.category = cut(song.getCategory(), 80);
        this.duration = song.getDuration();
    }

    /** A copy of {@code other} for another playlist. */
    public static PlaylistSong copyOf(PlaylistSong other, Long playlistId) {
        PlaylistSong copy = new PlaylistSong();
        copy.playlistId = playlistId;
        copy.title = other.title;
        copy.artist = other.artist;
        copy.url = other.url;
        copy.thumbnail = other.thumbnail;
        copy.category = other.category;
        copy.duration = other.duration;
        return copy;
    }

    private static String cut(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }
}
