package com.lavu.musicsyncbackend.auth;

import com.lavu.musicsyncbackend.model.Session;
import com.lavu.musicsyncbackend.model.SessionRepository;
import com.lavu.musicsyncbackend.model.User;
import com.lavu.musicsyncbackend.model.UserRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class AuthService {

    private static final long SESSION_TTL_MS = 30L * 24 * 60 * 60 * 1000;
    private static final Pattern USERNAME = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9 _.-]{1,18}[A-Za-z0-9]$");
    private static final int MIN_PASSWORD = 6;
    private static final int MAX_PASSWORD = 72; // BCrypt ignores anything beyond 72 bytes
    private static final int MAX_FAILURES = 8;
    private static final long FAILURE_WINDOW_MS = 10 * 60 * 1000;
    // Compared against when the user does not exist, so both paths cost one BCrypt check.
    private static final String DUMMY_HASH = new BCryptPasswordEncoder().encode("not-a-real-password");

    private final UserRepository users;
    private final SessionRepository sessions;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();
    private final Map<String, long[]> failures = new ConcurrentHashMap<>(); // key -> {count, windowStart}

    private final JwtService jwt;
    private final Presence presence;

    public AuthService(UserRepository users, SessionRepository sessions, JwtService jwt, Presence presence) {
        this.users = users;
        this.sessions = sessions;
        this.jwt = jwt;
        this.presence = presence;
    }

    @PostConstruct
    void purgeExpired() {
        sessions.deleteByExpiresAtLessThan(System.currentTimeMillis());
    }

    /**
     * @param token        access token (JWT), sent as {@code Authorization: Bearer} and valid for {@code expiresIn} seconds
     * @param refreshToken long-lived secret that buys new access tokens; only its hash is stored
     */
    public record Login(String token, String refreshToken, String username, long expiresIn) {}

    /** Why a username can't be registered, or null if it can. */
    public String usernameProblem(String username) {
        String display = clean(username);
        if (!USERNAME.matcher(display).matches()) return "Use 3-20 characters: letters, numbers, spaces, . _ or -";
        if (users.existsByUsername(display.toLowerCase())) return "That username is already taken";
        return null;
    }

    private static String clean(String username) {
        return username == null ? "" : username.trim().replaceAll("\\s+", " ");
    }

    public Login register(String username, String password) {
        String display = clean(username);
        if (!USERNAME.matcher(display).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Username must be 3-20 characters: letters, numbers, spaces, . _ or -");
        }
        if (password == null || password.length() < MIN_PASSWORD) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be at least " + MIN_PASSWORD + " characters");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password is too long");
        }
        String key = display.toLowerCase();
        if (users.existsByUsername(key)) {
            throw new ApiException(HttpStatus.CONFLICT, "That username is already taken");
        }
        User user;
        try {
            user = users.save(new User(null, key, display, encoder.encode(password)));
        } catch (DataIntegrityViolationException e) { // lost a race with another registration
            throw new ApiException(HttpStatus.CONFLICT, "That username is already taken");
        }
        return issue(user, null);
    }

    public Login login(String username, String password) {
        String key = username == null ? "" : username.trim().replaceAll("\\s+", " ").toLowerCase();
        if (key.isEmpty() || password == null || password.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Enter your username and password");
        }
        long now = System.currentTimeMillis();
        long[] f = failures.get(key);
        if (f != null && now - f[1] > FAILURE_WINDOW_MS) {
            failures.remove(key);
            f = null;
        }
        if (f != null && f[0] >= MAX_FAILURES) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in a few minutes.");
        }
        Optional<User> user = users.findByUsername(key);
        boolean ok = encoder.matches(password, user.map(User::getPasswordHash).orElse(DUMMY_HASH)) && user.isPresent();
        if (!ok) {
            if (failures.size() > 10_000) failures.clear();
            failures.merge(key, new long[]{1, now}, (old, fresh) -> new long[]{old[0] + 1, old[1]});
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Wrong username or password");
        }
        failures.remove(key);
        return issue(user.get(), null);
    }

    /** Checks an access token. No database lookup: the signature and expiry are enough. */
    public Optional<AuthUser> authenticate(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        return jwt.verify(token);
    }

    /** Trades a refresh token for a new access token and keeps the session alive for another 30 days. */
    public Login refresh(String refreshToken) {
        Session session = refreshToken == null || refreshToken.isBlank() ? null
                : sessions.findByTokenHash(hash(refreshToken)).orElse(null);
        if (session != null && session.getExpiresAt() < System.currentTimeMillis()) {
            sessions.delete(session);
            session = null;
        }
        User user = session == null ? null : users.findById(session.getUserId()).orElse(null);
        if (user == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Please sign in again");
        session.setExpiresAt(System.currentTimeMillis() + SESSION_TTL_MS);
        sessions.save(session);
        return issue(user, new Object[]{session, refreshToken});
    }

    public void logout(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) return;
        sessions.findByTokenHash(hash(refreshToken)).ifPresent(session -> {
            jwt.revoke(session.getId());
            presence.gone(session.getUserId());
            sessions.delete(session);
        });
    }

    /** Extracts the token from an {@code Authorization: Bearer ...} header value. */
    public static String bearer(String header) {
        if (header == null) return null;
        return header.regionMatches(true, 0, "Bearer ", 0, 7) ? header.substring(7).trim() : null;
    }

    /** @param existing {session, refreshToken} when refreshing; null starts a new session */
    private Login issue(User user, Object[] existing) {
        Session session;
        String refreshToken;
        if (existing != null) {
            session = (Session) existing[0];
            refreshToken = (String) existing[1];
        } else {
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            refreshToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            session = sessions.save(new Session(hash(refreshToken), user.getId(), System.currentTimeMillis() + SESSION_TTL_MS));
        }
        AuthUser authUser = new AuthUser(user.getId(), user.getDisplayName());
        presence.seen(user.getId());
        return new Login(jwt.issue(authUser, session.getId()), refreshToken, user.getDisplayName(), JwtService.ACCESS_TTL_SECONDS);
    }

    private static String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
