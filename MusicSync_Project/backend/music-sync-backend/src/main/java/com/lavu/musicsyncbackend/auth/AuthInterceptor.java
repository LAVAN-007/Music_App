package com.lavu.musicsyncbackend.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Optional;

/** Requires a valid bearer token on every /api call it is registered for. */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    public static final String USER_ATTR = "authUser";

    private final AuthService auth;

    public AuthInterceptor(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        Optional<AuthUser> user = auth.authenticate(AuthService.bearer(request.getHeader("Authorization")));
        if (user.isEmpty()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Please sign in again");
        }
        request.setAttribute(USER_ATTR, user.get());
        return true;
    }
}
