package com.lavu.musicsyncbackend.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Issues and checks the short-lived access tokens (JWT, HS256) that every API call and WebSocket
 * connection presents. Checking one needs no database lookup.
 */
@Service
public class JwtService {

    public static final long ACCESS_TTL_SECONDS = 15 * 60;

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    // Only tokens carrying exactly this header are accepted, so the algorithm can never be swapped.
    private static final String HEADER = B64.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));

    private final byte[] key;
    private final ObjectMapper mapper;
    private final Map<Long, Long> revoked = new ConcurrentHashMap<>(); // session id -> token expiry (seconds)

    public JwtService(@Value("${musicsync.jwt.secret:}") String secret, ObjectMapper mapper) throws Exception {
        this.mapper = mapper;
        if (secret == null || secret.isBlank()) {
            // No secret configured: use a fresh one for this run. Access tokens issued before a restart
            // stop working, and clients quietly get new ones with their refresh token.
            this.key = new byte[32];
            new SecureRandom().nextBytes(this.key);
        } else {
            this.key = MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8));
        }
    }

    public String issue(AuthUser user, long sessionId) {
        long now = System.currentTimeMillis() / 1000;
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", String.valueOf(user.id()));
        claims.put("name", user.username());
        claims.put("sid", sessionId);
        claims.put("iat", now);
        claims.put("exp", now + ACCESS_TTL_SECONDS);
        String body = HEADER + "." + B64.encodeToString(mapper.writeValueAsBytes(claims));
        return body + "." + B64.encodeToString(sign(body));
    }

    public Optional<AuthUser> verify(String token) {
        if (token == null) return Optional.empty();
        String[] parts = token.split("\\.");
        if (parts.length != 3 || !parts[0].equals(HEADER)) return Optional.empty();
        try {
            byte[] expected = sign(parts[0] + "." + parts[1]);
            if (!MessageDigest.isEqual(expected, Base64.getUrlDecoder().decode(parts[2]))) return Optional.empty();
            Map<?, ?> claims = mapper.readValue(Base64.getUrlDecoder().decode(parts[1]), Map.class);
            long now = System.currentTimeMillis() / 1000;
            if (!(claims.get("exp") instanceof Number exp) || exp.longValue() <= now) return Optional.empty();
            if (claims.get("sid") instanceof Number sid && revoked.containsKey(sid.longValue())) return Optional.empty();
            return Optional.of(new AuthUser(Long.valueOf(String.valueOf(claims.get("sub"))), String.valueOf(claims.get("name"))));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    /** Signing out ends the session's access tokens at once instead of when they expire. */
    public void revoke(long sessionId) {
        long now = System.currentTimeMillis() / 1000;
        revoked.values().removeIf(expiry -> expiry < now);
        revoked.put(sessionId, now + ACCESS_TTL_SECONDS);
    }

    private byte[] sign(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
