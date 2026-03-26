package com.lavu.musicsyncbackend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SyncMessage {
    private String action;
    private double timestamp;
    private int songId;
    private String username;
}