package com.lavu.musicsyncbackend.model;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PlaylistSongRepository extends JpaRepository<PlaylistSong, Long> {
    List<PlaylistSong> findByPlaylistIdInOrderByIdAsc(Collection<Long> playlistIds);
    Optional<PlaylistSong> findByIdAndPlaylistId(Long id, Long playlistId);
    boolean existsByPlaylistIdAndUrl(Long playlistId, String url);
    long countByPlaylistId(Long playlistId);
    List<PlaylistSong> findByPlaylistIdOrderByIdAsc(Long playlistId);

    @Transactional
    void deleteByPlaylistId(Long playlistId);
}
