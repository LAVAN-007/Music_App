package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.model.SyncMessage;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

@Controller
public class SyncController {

    @MessageMapping("/sync") // Users send to /app/sync
    @SendTo("/topic/state")  // Everyone receives from /topic/state
    public SyncMessage handleSync(SyncMessage message) {
        System.out.println("User: " + message.getUsername() +
                " | Action: " + message.getAction() +
                " | At: " + message.getTimestamp() + "s");
        return message;
    }
}