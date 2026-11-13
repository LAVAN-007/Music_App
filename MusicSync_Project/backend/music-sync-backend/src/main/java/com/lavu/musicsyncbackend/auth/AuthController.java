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

    @PostMapping("/logout")
    public Map<String, Boolean> logout(@RequestHeader(value = "Authorization", required = false) String header) {
        auth.logout(AuthService.bearer(header));
        return Map.of("ok", true);
    }
}
