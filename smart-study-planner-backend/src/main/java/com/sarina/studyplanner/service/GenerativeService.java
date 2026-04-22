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
 * Sends prompts to the Google Gemini API on the server side.
 *
 * The Gemini API key is fetched from Google Secret Manager via
 * {@link SecretManagerService} on the first call and then cached for the
 * lifetime of the process.  It is never returned in any HTTP response and
 * never reaches the browser.
 *
 * Security model:
 *   - The Gemini API key lives ONLY in Google Secret Manager.
 *   - SecretManagerService authenticates to GCP using OAuth2 user credentials
 *     (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN), which are
 *     stored as encrypted Replit Secrets — still not the key itself.
 *   - Only this class holds the cached key value; no controller, DTO, or
 *     response body ever contains it.
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

    /**
     * Returns true if Secret Manager is configured with all required credentials.
     * A false result means /api/generate will return 503 before attempting any
     * network call.
     */
    public boolean isConfigured() {
        return secretManagerService.isConfigured();
    }

    /**
     * Returns a description of whichever required environment values are missing,
     * for use in a helpful 503 error message.
     */
    public String missingConfigDescription() {
        return secretManagerService.missingConfigDescription();
    }

    /**
     * Sends a plain-text prompt to Gemini and returns the response text.
     *
     * On the first call, the Gemini API key is fetched from Google Secret Manager
     * and cached.  Subsequent calls reuse the cached value.
     *
     * @param prompt the user's prompt — validated and sanitised by the caller
     * @return the generated text from Gemini
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

    /**
     * Returns the cached Gemini API key, fetching it from Secret Manager on the
     * first call.
     *
     * Thread-safety note: two threads may both observe cachedApiKey == null on
     * the very first call and both fetch from Secret Manager.  That is harmless —
     * both will write the same value, and thereafter the cached copy is used.
     */
    private String resolveApiKey() throws IOException {
        if (cachedApiKey == null) {
            log.info("GenerativeService: fetching GEMINI_API_KEY from Google Secret Manager "
                    + "(first request — will be cached for subsequent calls).");
            cachedApiKey = secretManagerService.getSecret("GEMINI_API_KEY");
            log.info("GenerativeService: GEMINI_API_KEY successfully retrieved from "
                    + "Google Secret Manager and cached in memory.");
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
