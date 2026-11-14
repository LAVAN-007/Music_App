package com.lavu.musicsyncbackend.model;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlaylistRepository extends JpaRepository<Playlist, Long> {
    List<Playlist> findByUserIdOrderByIdAsc(Long userId);
    Optional<Playlist> findByIdAndUserId(Long id, Long userId);
    long countByUserId(Long userId);
}
