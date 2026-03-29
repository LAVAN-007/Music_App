package com.lavu.musicsyncbackend.controller;

import com.lavu.musicsyncbackend.model.SyncMessage;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import java.util.*;

@Controller
public class SyncController {

    private static SyncMessage currentGlobalState = new SyncMessage();
    private static long lastServerTime = System.currentTimeMillis();
    private static Set<String> activeUsers = Collections.synchronizedSet(new HashSet<>());

    static {
        currentGlobalState.setAction("PAUSE");
        currentGlobalState.setTimestamp(0.0);
        currentGlobalState.setSongId("1");
    }

    @MessageMapping("/sync")
    @SendTo("/topic/state")
    public SyncMessage handleSync(SyncMessage message) {
        if ("JOIN".equals(message.getAction())) {
            activeUsers.add(message.getUsername());
        } else if ("LEAVE".equals(message.getAction())) {
            activeUsers.remove(message.getUsername());
        }

        currentGlobalState = message;
        lastServerTime = System.currentTimeMillis();
        return message;
    }

    @GetMapping("/api/current-state")
    @ResponseBody
    public Map<String, Object> getCurrentState() {
        Map<String, Object> response = new HashMap<>();
        response.put("state", currentGlobalState);
        response.put("serverTime", System.currentTimeMillis());
        response.put("lastUpdateAt", lastServerTime);
        return response;
    }

    @GetMapping("/api/active-users")
    @ResponseBody
    public Set<String> getActiveUsers() {
        return activeUsers;
    }
}