package com.lavu.musicsyncbackend.auth;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record Credentials(String username, String password) {}

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    public AuthService.Login register(@RequestBody Credentials body) {
        return auth.register(body.username(), body.password());
    }

    @PostMapping("/login")
    public AuthService.Login login(@RequestBody Credentials body) {
        return auth.login(body.username(), body.password());
    }

    @GetMapping("/me")
    public Map<String, String> me(@RequestAttribute(AuthInterceptor.USER_ATTR) AuthUser user) {
        return Map.of("username", user.username());
    }

    public record RefreshRequest(String refreshToken) {}

    /** Called by the client when its access token has expired (or is about to). */
    @PostMapping("/refresh")
    public AuthService.Login refresh(@RequestBody RefreshRequest body) {
        return auth.refresh(body.refreshToken());
    }

    @PostMapping("/logout")
    public Map<String, Boolean> logout(@RequestBody(required = false) RefreshRequest body) {
        if (body != null) auth.logout(body.refreshToken());
        return Map.of("ok", true);
    }

    /** Lets the sign-up form say whether a username is free before the form is sent. */
    @GetMapping("/available")
    public Map<String, Object> available(@RequestParam String username) {
        String problem = auth.usernameProblem(username);
        return problem == null ? Map.of("available", true) : Map.of("available", false, "reason", problem);
    }
}
