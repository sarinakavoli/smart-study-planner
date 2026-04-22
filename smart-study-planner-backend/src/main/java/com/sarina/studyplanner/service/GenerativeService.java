package com.sarina.studyplanner.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Sends prompts to the Google Gemini API server-side.
 * The API key is fetched from Google Secret Manager via {@link SecretManagerService}
 * on the first call and cached for subsequent calls. It is never returned to callers.
 */
@Service
public class GenerativeService {

    private static final Logger log = LoggerFactory.getLogger(GenerativeService.class);

    private static final String GEMINI_API_URL =
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    private final SecretManagerService secretManagerService;
    private final HttpClient httpClient;

    // Cached on first successful fetch; volatile so all threads see the update.
    private volatile String cachedApiKey;

    public GenerativeService(SecretManagerService secretManagerService) {
        this.secretManagerService = secretManagerService;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /** Returns true when Secret Manager has all required credentials. */
    public boolean isConfigured() {
        return secretManagerService.isConfigured();
    }

    /** Returns a comma-separated list of missing required config keys. */
    public String missingConfigDescription() {
        return secretManagerService.missingConfigDescription();
    }

    /**
     * Sends {@code prompt} to Gemini and returns the response text.
     * Fetches the API key from Secret Manager on the first call and caches it.
     *
     * @throws IOException          if the Secret Manager fetch or HTTP request fails
     * @throws InterruptedException if the request is interrupted
     */
    public String generate(String prompt) throws IOException, InterruptedException {
        String apiKey = resolveApiKey();

        String requestBody = buildRequestBody(prompt);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(GEMINI_API_URL + "?key=" + apiKey))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .timeout(Duration.ofSeconds(30))
                .build();

        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 429) {
            throw new IOException("QUOTA_EXCEEDED");
        }

        if (response.statusCode() != 200) {
            throw new IOException(
                    "Gemini API returned status " + response.statusCode());
        }

        return extractText(response.body());
    }

    // Two threads may both see null on the very first call and both fetch;
    // that is harmless — both write the same value and subsequent calls use the cache.
    private String resolveApiKey() throws IOException {
        if (cachedApiKey == null) {
            log.info("Fetching GEMINI_API_KEY from Secret Manager (will be cached).");
            cachedApiKey = secretManagerService.getSecret("GEMINI_API_KEY");
            log.info("GEMINI_API_KEY retrieved from Secret Manager and cached.");
        }
        return cachedApiKey;
    }

    private String buildRequestBody(String prompt) {
        String escaped = prompt
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");

        return """
                {
                  "contents": [
                    {
                      "parts": [
                        { "text": "%s" }
                      ]
                    }
                  ]
                }
                """.formatted(escaped);
    }

    private String extractText(String json) {
        int textIdx = json.indexOf("\"text\":");
        if (textIdx == -1) return "";

        int start = json.indexOf("\"", textIdx + 7) + 1;
        int end = json.indexOf("\"", start);

        while (end > 0 && json.charAt(end - 1) == '\\') {
            end = json.indexOf("\"", end + 1);
        }

        if (start <= 0 || end <= 0) return "";

        return json.substring(start, end)
                .replace("\\n", "\n")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }
}
