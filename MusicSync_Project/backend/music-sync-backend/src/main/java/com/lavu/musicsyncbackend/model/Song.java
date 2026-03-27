package com.lavu.musicsyncbackend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class Song {
    private int id; // Kept as int to match your original stable logic
    private String title;
    private String artist;
    private String url;
    private String thumbnail;
    private String category;
}