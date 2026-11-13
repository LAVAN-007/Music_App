package com.lavu.musicsyncbackend.config;

import com.lavu.musicsyncbackend.auth.AuthService;
import com.lavu.musicsyncbackend.auth.AuthUser;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final AuthService auth;

    public WebSocketConfig(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        ThreadPoolTaskScheduler heartbeats = new ThreadPoolTaskScheduler();
        heartbeats.setPoolSize(1);
        heartbeats.setThreadNamePrefix("ws-heartbeat-");
        heartbeats.setDaemon(true);
        heartbeats.initialize();
        config.enableSimpleBroker("/topic")
                .setHeartbeatValue(new long[]{10_000, 10_000})
                .setTaskScheduler(heartbeats);
        config.setApplicationDestinationPrefixes("/app");
        // Listeners must see state changes in the order the room applied them.
        config.setPreservePublishOrder(true);
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns("*");
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.setMessageSizeLimit(16 * 1024);
    }

    /** Every STOMP connection must present the same bearer token the REST API uses. */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        // One worker handles client messages in arrival order, so two quick taps (e.g. "add to queue"
        // twice) can't be applied out of order. Handlers only touch in-memory room state, so this is cheap.
        registration.taskExecutor().corePoolSize(1).maxPoolSize(1);
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor == null || accessor.getCommand() == null) return message;

                if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                    String token = AuthService.bearer(accessor.getFirstNativeHeader("Authorization"));
                    AuthUser user = auth.authenticate(token)
                            .orElseThrow(() -> new MessageDeliveryException("UNAUTHORIZED"));
                    accessor.setUser(user);
                } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                    String destination = accessor.getDestination();
                    if (accessor.getUser() == null || destination == null || !destination.startsWith("/topic/room/")) {
                        throw new MessageDeliveryException("FORBIDDEN");
                    }
                }
                return message;
            }
        });
    }
}
