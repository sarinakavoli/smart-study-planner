package com.sarina.studyplanner.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GenerativeServiceTest {

    @Mock
    private SecretManagerService secretManagerService;

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private GenerativeService generativeService;

    @BeforeEach
    void setUp() {
        generativeService = new GenerativeService(secretManagerService, httpClient);
    }

    // -----------------------------------------------------------------------
    // isConfigured() — delegates to SecretManagerService
    // -----------------------------------------------------------------------

    @Test
    void isConfigured_delegatesToSecretManagerService_returnsTrue() {
        when(secretManagerService.isConfigured()).thenReturn(true);

        assertThat(generativeService.isConfigured()).isTrue();
        verify(secretManagerService).isConfigured();
    }

    @Test
    void isConfigured_delegatesToSecretManagerService_returnsFalse() {
        when(secretManagerService.isConfigured()).thenReturn(false);

        assertThat(generativeService.isConfigured()).isFalse();
        verify(secretManagerService).isConfigured();
    }

    @Test
    void missingConfigDescription_delegatesToSecretManagerService() {
        when(secretManagerService.missingConfigDescription())
                .thenReturn("GCP_PROJECT_ID, GCP_SERVICE_ACCOUNT_JSON");

        String desc = generativeService.missingConfigDescription();

        assertThat(desc).isEqualTo("GCP_PROJECT_ID, GCP_SERVICE_ACCOUNT_JSON");
        verify(secretManagerService).missingConfigDescription();
    }

    // -----------------------------------------------------------------------
    // generate() — resolves API key and caches it
    // -----------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    @Test
    void generate_fetchesApiKeyFromSecretManagerOnFirstCall() throws IOException, InterruptedException {
        when(secretManagerService.getSecret("GEMINI_API_KEY")).thenReturn("my-api-key");
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(successBody("Hello"));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(httpResponse);

        generativeService.generate("Say hello");

        verify(secretManagerService).getSecret("GEMINI_API_KEY");
    }

    @SuppressWarnings("unchecked")
    @Test
    void generate_cachesApiKeyAndDoesNotFetchOnSubsequentCalls()
            throws IOException, InterruptedException {
        when(secretManagerService.getSecret("GEMINI_API_KEY")).thenReturn("my-api-key");
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(successBody("Hi"));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(httpResponse);

        generativeService.generate("First call");
        generativeService.generate("Second call");
        generativeService.generate("Third call");

        verify(secretManagerService, times(1)).getSecret("GEMINI_API_KEY");
    }

    @SuppressWarnings("unchecked")
    @Test
    void generate_returnsExtractedResponseText() throws IOException, InterruptedException {
        when(secretManagerService.getSecret("GEMINI_API_KEY")).thenReturn("my-api-key");
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(successBody("Study plan created"));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(httpResponse);

        String result = generativeService.generate("Create a study plan");

        assertThat(result).isEqualTo("Study plan created");
    }

    // -----------------------------------------------------------------------
    // generate() — error paths
    // -----------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    @Test
    void generate_throwsIoExceptionOnQuotaExceeded() throws IOException, InterruptedException {
        when(secretManagerService.getSecret("GEMINI_API_KEY")).thenReturn("my-api-key");
        when(httpResponse.statusCode()).thenReturn(429);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(httpResponse);

        IOException ex = org.junit.jupiter.api.Assertions.assertThrows(IOException.class,
                () -> generativeService.generate("prompt"));
        assertThat(ex.getMessage()).contains("QUOTA_EXCEEDED");
    }

    @SuppressWarnings("unchecked")
    @Test
    void generate_throwsIoExceptionOnNon200Response() throws IOException, InterruptedException {
        when(secretManagerService.getSecret("GEMINI_API_KEY")).thenReturn("my-api-key");
        when(httpResponse.statusCode()).thenReturn(500);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(httpResponse);

        org.junit.jupiter.api.Assertions.assertThrows(IOException.class,
                () -> generativeService.generate("prompt"));
    }

    // -----------------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------------

    /** Builds a minimal Gemini-style JSON response containing the given text. */
    private static String successBody(String text) {
        return """
                {
                  "candidates": [
                    {
                      "content": {
                        "parts": [
                          { "text": "%s" }
                        ]
                      }
                    }
                  ]
                }
                """.formatted(text);
    }
}
