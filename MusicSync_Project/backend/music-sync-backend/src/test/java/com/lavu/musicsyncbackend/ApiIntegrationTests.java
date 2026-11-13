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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
class ApiIntegrationTests {

    @Autowired
    WebApplicationContext context;
    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    private String register(String username, String password) throws Exception {
        String body = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
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

        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
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
