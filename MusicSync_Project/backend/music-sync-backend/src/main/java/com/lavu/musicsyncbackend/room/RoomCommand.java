package com.lavu.musicsyncbackend.room;

/** A message from a client. Which fields are read depends on {@code type}. */
public record RoomCommand(String type, Integer songId, Double position, Integer index, String text, Long version,
                          Long replyTo, String image) {}
