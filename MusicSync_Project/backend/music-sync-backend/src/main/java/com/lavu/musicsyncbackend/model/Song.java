package com.lavu.musicsyncbackend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class Song {
    private int id;
    private String title;
    private String artist;
    private String url;
    private String thumbnail;
    private String category;
    /** Length in seconds, 0 when unknown. */
    private int duration;
}
