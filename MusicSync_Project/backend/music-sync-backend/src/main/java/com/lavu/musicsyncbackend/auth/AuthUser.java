package com.lavu.musicsyncbackend.auth;

import java.security.Principal;

/** The authenticated caller. {@code username} is the display name shown to other listeners. */
public record AuthUser(Long id, String username) implements Principal {
    @Override
    public String getName() {
        return username;
    }
}
