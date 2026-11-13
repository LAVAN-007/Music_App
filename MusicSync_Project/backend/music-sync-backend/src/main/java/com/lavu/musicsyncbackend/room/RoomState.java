package com.lavu.musicsyncbackend.room;

import java.util.List;

/**
 * Authoritative playback state. While {@code playing}, the live position is
 * {@code position + (serverNow - updatedAt) / 1000}.
 */
public record RoomState(Integer songId, double position, boolean playing, long updatedAt, long version,
                        List<Integer> queue) {}
