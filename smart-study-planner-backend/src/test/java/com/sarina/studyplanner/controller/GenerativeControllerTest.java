package com.sarina.studyplanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarina.studyplanner.service.GenerativeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class GenerativeControllerTest {

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @Mock
    private GenerativeService generativeService;

    @InjectMocks
    private GenerativeController generativeController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(generativeController).build();
        objectMapper = new ObjectMapper();
    }

    // -----------------------------------------------------------------------
    // 503 — service not configured
    // -----------------------------------------------------------------------

    @Test
    void generate_returns503WhenServiceIsNotConfigured() throws Exception {
        when(generativeService.isConfigured()).thenReturn(false);
        when(generativeService.missingConfigDescription())
                .thenReturn("GCP_PROJECT_ID, GCP_SERVICE_ACCOUNT_JSON");

        mockMvc.perform(post("/api/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("prompt", "hello"))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void generate_503ResponseMentionsMissingConfig() throws Exception {
        when(generativeService.isConfigured()).thenReturn(false);
        when(generativeService.missingConfigDescription())
                .thenReturn("GCP_PROJECT_ID");

        mockMvc.perform(post("/api/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("prompt", "hello"))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value(
                        org.hamcrest.Matchers.containsString("GCP_PROJECT_ID")));
    }

    // -----------------------------------------------------------------------
    // 400 — missing or blank prompt
    // -----------------------------------------------------------------------

    @Test
    void generate_returns400WhenPromptIsMissing() throws Exception {
        mockMvc.perform(post("/api/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void generate_returns400WhenPromptIsBlank() throws Exception {
        mockMvc.perform(post("/api/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("prompt", "   "))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // -----------------------------------------------------------------------
    // 200 — happy path
    // -----------------------------------------------------------------------

    @Test
    void generate_returns200WithResultWhenServiceIsConfiguredAndSucceeds() throws Exception {
        when(generativeService.isConfigured()).thenReturn(true);
        when(generativeService.generate("hello")).thenReturn("Hi there!");

        mockMvc.perform(post("/api/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("prompt", "hello"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("Hi there!"));
    }

    // -----------------------------------------------------------------------
    // 429 — quota exceeded
    // -----------------------------------------------------------------------

    @Test
    void generate_returns429WhenQuotaExceeded() throws Exception {
        when(generativeService.isConfigured()).thenReturn(true);
        when(generativeService.generate("hello")).thenThrow(new java.io.IOException("QUOTA_EXCEEDED"));

        mockMvc.perform(post("/api/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("prompt", "hello"))))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").exists());
    }

    // -----------------------------------------------------------------------
    // 502 — upstream failure
    // -----------------------------------------------------------------------

    @Test
    void generate_returns502WhenGeminiApiFails() throws Exception {
        when(generativeService.isConfigured()).thenReturn(true);
        when(generativeService.generate("hello"))
                .thenThrow(new java.io.IOException("connection refused"));

        mockMvc.perform(post("/api/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("prompt", "hello"))))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error").exists());
    }
}
