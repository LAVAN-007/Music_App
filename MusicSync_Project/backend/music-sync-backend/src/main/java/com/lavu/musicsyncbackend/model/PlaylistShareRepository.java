package com.lavu.musicsyncbackend.model;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface PlaylistShareRepository extends JpaRepository<PlaylistShare, Long> {
    List<PlaylistShare> findByToUserIdOrderByIdDesc(Long toUserId);
    Optional<PlaylistShare> findByIdAndToUserId(Long id, Long toUserId);
    boolean existsByPlaylistIdAndToUserId(Long playlistId, Long toUserId);

    @Transactional
    void deleteByPlaylistId(Long playlistId);
}
