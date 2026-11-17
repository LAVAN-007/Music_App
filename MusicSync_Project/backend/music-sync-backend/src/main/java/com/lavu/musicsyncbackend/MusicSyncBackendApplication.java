package com.lavu.musicsyncbackend;

import com.lavu.musicsyncbackend.config.DatabaseUrl;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class MusicSyncBackendApplication {

    public static void main(String[] args) {
        DatabaseUrl.apply(); // picks up DATABASE_URL (a hosted Postgres) if there is one
        SpringApplication.run(MusicSyncBackendApplication.class, args);
    }

}
