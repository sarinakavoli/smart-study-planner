package com.sarina.studyplanner.service;

import org.springframework.beans.factory.annotation.Value;
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
 * The API key is injected from the GEMINI_API_KEY environment variable (a Replit
 * Secret) via application.properties.  It never leaves this class and is never
 * serialised into any HTTP response returned to the browser.
 */
@Service
public class GenerativeService {

    private static final String GEMINI_API_URL =
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    private final String apiKey;
    private final HttpClient httpClient;

    public GenerativeService(@Value("${gemini.api.key:}") String apiKey) {
        this.apiKey = apiKey;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * Returns true if the Gemini API key has been configured.
     * Use this to give callers a clear error before attempting a request.
     */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * Sends a plain-text prompt to Gemini and returns the response text.
     *
     * @param prompt the user's prompt — validated and sanitised by the caller
     * @return the generated text from Gemini
     * @throws IllegalStateException if the API key is not configured
     * @throws IOException           if the HTTP request fails
     * @throws InterruptedException  if the request is interrupted
     */
    public String generate(String prompt) throws IOException, InterruptedException {
        if (!isConfigured()) {
            throw new IllegalStateException(
                    "GEMINI_API_KEY is not set. Add it as a Replit Secret.");
        }

        String requestBody = buildRequestBody(prompt);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(GEMINI_API_URL + "?key=" + apiKey))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .timeout(Duration.ofSeconds(30))
                .build();

        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());

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
