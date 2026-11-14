package com.lavu.musicsyncbackend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "playlists", indexes = @Index(columnList = "userId"))
@Data
@NoArgsConstructor
public class Playlist {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false)
    private long createdAt;

    public Playlist(Long userId, String name) {
        this.userId = userId;
        this.name = name;
        this.createdAt = System.currentTimeMillis();
    }
}
