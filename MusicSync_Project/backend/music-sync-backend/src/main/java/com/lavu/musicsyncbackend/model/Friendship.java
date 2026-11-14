package com.lavu.musicsyncbackend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A friend request from one user to another; once accepted, the two are friends. */
@Entity
@Table(name = "friendships", uniqueConstraints = @UniqueConstraint(columnNames = {"requesterId", "addresseeId"}))
@Data
@NoArgsConstructor
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long requesterId;

    @Column(nullable = false)
    private Long addresseeId;

    @Column(nullable = false)
    private boolean accepted;

    @Column(nullable = false)
    private long createdAt;

    public Friendship(Long requesterId, Long addresseeId) {
        this.requesterId = requesterId;
        this.addresseeId = addresseeId;
        this.createdAt = System.currentTimeMillis();
    }
}
