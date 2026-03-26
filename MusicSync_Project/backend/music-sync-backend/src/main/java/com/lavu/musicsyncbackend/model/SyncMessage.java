package com.lavu.musicsyncbackend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.Set;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SyncMessage {
    private String action;   // PLAY, PAUSE, JOIN, PRESENCE, STATE
    private Double timestamp;
    private Integer songId;
    private String username;
    private Set<String> connectedUsers;
    private Boolean playing;
}
