package com.lavu.musicsyncbackend.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Lets the app be pointed at a hosted Postgres with the single connection string providers hand
 * out ({@code DATABASE_URL=postgresql://user:password@host/db?sslmode=require}).
 *
 * The value is taken from the environment (how a host such as Render supplies it) or, for local
 * runs, from a {@code .env} file in the working directory or one of its parents. It is translated
 * into the three settings the JDBC driver needs and never logged.
 */
public final class DatabaseUrl {

    private DatabaseUrl() {}

    /** Call before Spring starts. Does nothing if no connection string is found or one is already configured. */
    public static void apply() {
        if (System.getenv("SPRING_DATASOURCE_URL") != null || System.getProperty("spring.datasource.url") != null) return;
        String url = System.getenv("DATABASE_URL");
        if (url == null || url.isBlank()) url = fromEnvFile();
        if (url == null || url.isBlank()) return;
        try {
            String[] parts = parse(url.trim());
            System.setProperty("MUSICSYNC_DB_URL", parts[0]);
            System.setProperty("MUSICSYNC_DB_USERNAME", parts[1]);
            System.setProperty("MUSICSYNC_DB_PASSWORD", parts[2]);
            System.out.println("Database: Postgres at " + URI.create(parts[0].substring(5)).getHost());
        } catch (RuntimeException e) {
            // Never echo the value: it contains the password.
            System.err.println("Database: DATABASE_URL is not a postgresql:// connection string; using the local file database instead");
        }
    }

    /** @return {jdbcUrl, username, password} */
    static String[] parse(String url) {
        URI uri = URI.create(url.replaceFirst("^postgres(ql)?://", "postgresql://"));
        if (!"postgresql".equals(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() == null) {
            throw new IllegalArgumentException("not a postgresql:// URL");
        }
        String[] credentials = uri.getRawUserInfo().split(":", 2);
        String user = URLDecoder.decode(credentials[0], StandardCharsets.UTF_8);
        String password = credentials.length > 1 ? URLDecoder.decode(credentials[1], StandardCharsets.UTF_8) : "";
        // Keep the options the driver understands (sslmode and friends); it has no channel_binding option.
        List<String> options = new ArrayList<>();
        if (uri.getRawQuery() != null) {
            for (String option : uri.getRawQuery().split("&")) {
                if (!option.isBlank() && !option.startsWith("channel_binding=")) options.add(option);
            }
        }
        String jdbc = "jdbc:postgresql://" + uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "") + uri.getRawPath()
                + (options.isEmpty() ? "" : "?" + String.join("&", options));
        return new String[]{jdbc, user, password};
    }

    private static String fromEnvFile() {
        Path dir = Path.of("").toAbsolutePath();
        for (int i = 0; i < 4 && dir != null; i++, dir = dir.getParent()) {
            Path file = dir.resolve(".env");
            if (!Files.isRegularFile(file)) continue;
            try {
                for (String line : Files.readAllLines(file)) {
                    String trimmed = line.trim();
                    if (!trimmed.startsWith("DATABASE_URL=")) continue;
                    String value = trimmed.substring("DATABASE_URL=".length()).trim();
                    if (value.length() >= 2 && (value.startsWith("\"") || value.startsWith("'"))) value = value.substring(1, value.length() - 1);
                    return value;
                }
            } catch (Exception ignored) { /* unreadable file: carry on looking */ }
        }
        return null;
    }
}
