package com.lavu.musicsyncbackend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A playlist offered to a friend. Accepting it gives the friend their own copy. */
@Entity
@Table(name = "playlist_shares", uniqueConstraints = @UniqueConstraint(columnNames = {"playlistId", "toUserId"}),
        indexes = @Index(columnList = "toUserId"))
@Data
@NoArgsConstructor
public class PlaylistShare {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long playlistId;

    @Column(nullable = false)
    private Long fromUserId;

    @Column(nullable = false)
    private Long toUserId;

    @Column(nullable = false)
    private long createdAt;

    public PlaylistShare(Long playlistId, Long fromUserId, Long toUserId) {
        this.playlistId = playlistId;
        this.fromUserId = fromUserId;
        this.toUserId = toUserId;
        this.createdAt = System.currentTimeMillis();
    }
}
