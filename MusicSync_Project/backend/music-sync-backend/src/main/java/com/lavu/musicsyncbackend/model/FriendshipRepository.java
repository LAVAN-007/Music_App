package com.lavu.musicsyncbackend.model;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {
    Optional<Friendship> findByRequesterIdAndAddresseeId(Long requesterId, Long addresseeId);
    List<Friendship> findByRequesterIdOrAddresseeIdOrderByIdAsc(Long requesterId, Long addresseeId);
}
