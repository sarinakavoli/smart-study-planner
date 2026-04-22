package com.sarina.studyplanner.service;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Sends prompts to the Google Gemini API on the server side.
 *
 * The Gemini API key is fetched from Google Cloud Secret Manager via
 * SecretManagerService — it is never read from an environment variable,
 * never hardcoded, and never included in any HTTP response to the browser.
 *
 * The key is cached in memory after the first successful fetch so that
 * Secret Manager is not called on every request.
 */
@Service
public class GenerativeService {

    private static final String GEMINI_API_URL =
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    private static final String GEMINI_SECRET_NAME = "GEMINI_API_KEY";

    private final SecretManagerService secretManagerService;
    private final HttpClient httpClient;

    /**
     * Cached copy of the API key.  Marked volatile so that if two threads
     * call generate() simultaneously before the key is loaded, each sees the
     * most recently written value without synchronisation overhead.
     */
    private volatile String cachedApiKey;

    public GenerativeService(SecretManagerService secretManagerService) {
        this.secretManagerService = secretManagerService;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * Returns true when Secret Manager credentials and the GCP project ID
     * are both present in the environment.
     */
    public boolean isConfigured() {
        return secretManagerService.isConfigured();
    }

    /**
     * Returns the cached API key, fetching it from Secret Manager on the
     * first call.
     */
    private String resolveApiKey() throws IOException {
        if (cachedApiKey == null || cachedApiKey.isBlank()) {
            cachedApiKey = secretManagerService.getSecret(GEMINI_SECRET_NAME);
        }
        return cachedApiKey;
    }

    /**
     * Sends a plain-text prompt to Gemini and returns the response text.
     *
     * @param prompt the user's prompt — validated and sanitised by the caller
     * @return the generated text from Gemini
     * @throws IllegalStateException if Secret Manager is not configured
     * @throws IOException           if the Secret Manager or Gemini API call fails
     * @throws InterruptedException  if the HTTP request is interrupted
     */
    public String generate(String prompt) throws IOException, InterruptedException {
        if (!isConfigured()) {
            throw new IllegalStateException(
                    "Google Cloud Secret Manager is not configured.");
        }

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
