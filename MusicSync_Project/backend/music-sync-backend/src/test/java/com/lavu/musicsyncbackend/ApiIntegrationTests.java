package com.lavu.musicsyncbackend;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
class ApiIntegrationTests {

    @Autowired
    WebApplicationContext context;
    MockMvc mvc;
    String lastRefreshToken;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    private String register(String username, String password) throws Exception {
        String body = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        lastRefreshToken = body.replaceAll(".*\"refreshToken\":\"([^\"]+)\".*", "$1");
        return body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    @Test
    void registerLoginAndLogout() throws Exception {
        String token = register("Asha", "secret1");

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.username").value("Asha"));

        // Usernames are case-insensitive and unique
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"asha\",\"password\":\"another1\"}"))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"ASHA\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized());

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"ASHA\",\"password\":\"secret1\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.username").value("Asha"));

        // The access token is a signed JWT; a tampered one is refused.
        org.junit.jupiter.api.Assertions.assertEquals(3, token.split("\\.").length);
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token.substring(0, token.length() - 2) + "xx"))
                .andExpect(status().isUnauthorized());

        // The refresh token buys a new access token...
        String refresh = lastRefreshToken;
        mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.username").value("Asha")).andExpect(jsonPath("$.token").isString());
        mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"nope\"}"))
                .andExpect(status().isUnauthorized());

        // ...until the user signs out, which also ends the access token at once.
        mvc.perform(post("/api/auth/logout").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/auth/available").param("username", "asha")).andExpect(jsonPath("$.available").value(false));
        mvc.perform(get("/api/auth/available").param("username", "Someone New")).andExpect(jsonPath("$.available").value(true));
    }

    @Test
    void friendsFlow() throws Exception {
        String chitra = "Bearer " + register("Chitra", "secret1");
        String dev = "Bearer " + register("Dev", "secret1");

        mvc.perform(get("/api/friends/search").param("q", "chi").header("Authorization", dev))
                .andExpect(jsonPath("$[0].username").value("Chitra")).andExpect(jsonPath("$[0].relation").value("none"));
        mvc.perform(post("/api/friends").header("Authorization", dev).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"chitra\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("outgoing"));
        mvc.perform(post("/api/friends").header("Authorization", dev).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"dev\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/friends").header("Authorization", dev).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"nobody\"}"))
                .andExpect(status().isNotFound());

        mvc.perform(get("/api/friends").header("Authorization", chitra))
                .andExpect(jsonPath("$.incoming[0]").value("Dev")).andExpect(jsonPath("$.friends", hasSize(0)));
        mvc.perform(post("/api/friends/accept").header("Authorization", chitra).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"Dev\"}"))
                .andExpect(jsonPath("$.status").value("friend"));
        mvc.perform(get("/api/friends").header("Authorization", dev))
                .andExpect(jsonPath("$.friends[0].username").value("Chitra")).andExpect(jsonPath("$.friends[0].online").value(true))
                .andExpect(jsonPath("$.outgoing", hasSize(0)));

        mvc.perform(post("/api/friends/remove").header("Authorization", chitra).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"Dev\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/friends").header("Authorization", dev)).andExpect(jsonPath("$.friends", hasSize(0)));
    }

    @Test
    void playlistsBelongToTheirOwner() throws Exception {
        String esha = "Bearer " + register("Esha", "secret1");
        String farid = "Bearer " + register("Farid", "secret1");

        String body = mvc.perform(post("/api/playlists").header("Authorization", esha).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  Road   trip \"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Road trip")).andReturn().getResponse().getContentAsString();
        String id = body.replaceAll(".*\"id\":(\\d+).*", "$1");
        mvc.perform(post("/api/playlists").header("Authorization", esha).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\" \"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/playlists/" + id + "/songs").header("Authorization", esha).contentType(MediaType.APPLICATION_JSON).content("{\"songId\":3}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(3)).andExpect(jsonPath("$.title").value("SoundHelix Song 3"));
        mvc.perform(post("/api/playlists/" + id + "/songs").header("Authorization", esha).contentType(MediaType.APPLICATION_JSON).content("{\"songId\":3}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/playlists/" + id + "/songs").header("Authorization", esha).contentType(MediaType.APPLICATION_JSON).content("{\"songId\":999}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/playlists/" + id + "/songs").header("Authorization", farid).contentType(MediaType.APPLICATION_JSON).content("{\"songId\":4}"))
                .andExpect(status().isNotFound());

        mvc.perform(get("/api/playlists").header("Authorization", esha))
                .andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].songs", hasSize(1))).andExpect(jsonPath("$[0].songs[0].id").value(3));
        mvc.perform(get("/api/playlists").header("Authorization", farid)).andExpect(jsonPath("$", hasSize(0)));

        mvc.perform(put("/api/playlists/" + id).header("Authorization", esha).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Drive\"}"))
                .andExpect(jsonPath("$.name").value("Drive"));
        mvc.perform(delete("/api/playlists/" + id).header("Authorization", farid)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/playlists/" + id).header("Authorization", esha)).andExpect(status().isOk());
        mvc.perform(get("/api/playlists").header("Authorization", esha)).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void rejectsWeakCredentials() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"ab\",\"password\":\"secret1\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"Valid Name\",\"password\":\"123\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void apiRequiresAToken() throws Exception {
        mvc.perform(get("/api/songs")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/rooms")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/songs").header("Authorization", "Bearer nope")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/time")).andExpect(status().isOk());
    }

    @Test
    void createAndLookUpRoom() throws Exception {
        String token = register("Bala", "secret1");

        mvc.perform(get("/api/songs").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loading").value(false))
                .andExpect(jsonPath("$.songs", hasSize(8)));

        String body = mvc.perform(post("/api/rooms").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdBy").value("Bala"))
                .andExpect(jsonPath("$.state.songId").value(1))
                .andExpect(jsonPath("$.state.playing").value(false))
                .andReturn().getResponse().getContentAsString();
        String code = body.replaceAll(".*\"code\":\"([^\"]+)\".*", "$1");

        // Codes are case-insensitive for people typing them in
        mvc.perform(get("/api/rooms/" + code.toLowerCase()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(code));
        mvc.perform(get("/api/rooms/ZZZZZZ").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }
}
