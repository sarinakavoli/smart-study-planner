package com.sarina.studyplanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.lang.reflect.Field;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    private MockMvc mockMvc;

    private ObjectMapper objectMapper;

    @Mock
    private UserService userService;

    @InjectMocks
    private AuthController authController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(authController).build();
        objectMapper = new ObjectMapper();
    }

    private User buildUser(Long id, String name) throws Exception {
        User user = new User();
        user.setName(name);
        Field idField = User.class.getDeclaredField("id");
        idField.setAccessible(true);
        idField.set(user, id);
        return user;
    }

    @Test
    void login_withValidCredentials_returnsOkWithIdAndName() throws Exception {
        User user = buildUser(1L, "alice");
        when(userService.login("alice", "secret")).thenReturn(user);

        Map<String, String> body = Map.of("username", "alice", "password", "secret");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("alice"));
    }

    @Test
    void login_withMissingUsername_returnsBadRequest() throws Exception {
        Map<String, String> body = Map.of("password", "secret");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Username is required."));
    }

    @Test
    void login_withMissingPassword_returnsBadRequest() throws Exception {
        Map<String, String> body = Map.of("username", "alice");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Password is required."));
    }

    @Test
    void login_withInvalidCredentials_returnsUnauthorized() throws Exception {
        when(userService.login(anyString(), anyString()))
                .thenThrow(new RuntimeException("Invalid credentials"));

        Map<String, String> body = Map.of("username", "alice", "password", "wrong");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid credentials"));
    }

    @Test
    void register_withValidData_returnsOkWithIdAndName() throws Exception {
        User user = buildUser(2L, "bob");
        when(userService.register("bob", "pass1234")).thenReturn(user);

        Map<String, String> body = Map.of("username", "bob", "password", "pass1234");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(2))
                .andExpect(jsonPath("$.name").value("bob"));
    }

    @Test
    void register_withMissingUsername_returnsBadRequest() throws Exception {
        Map<String, String> body = Map.of("password", "pass1234");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Username is required."));
    }

    @Test
    void register_withMissingPassword_returnsBadRequest() throws Exception {
        Map<String, String> body = Map.of("username", "bob");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Password is required."));
    }

    @Test
    void register_withShortPassword_returnsBadRequest() throws Exception {
        Map<String, String> body = Map.of("username", "bob", "password", "abc");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Password must be at least 4 characters."));
    }

    @Test
    void register_withDuplicateUsername_returnsConflict() throws Exception {
        when(userService.register(anyString(), anyString()))
                .thenThrow(new RuntimeException("Username already taken"));

        Map<String, String> body = Map.of("username", "alice", "password", "pass1234");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Username already taken"));
    }
}
