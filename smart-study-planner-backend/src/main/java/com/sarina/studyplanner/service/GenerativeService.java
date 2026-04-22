package com.sarina.studyplanner.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import org.springframework.beans.factory.annotation.Autowired;
import jakarta.annotation.PostConstruct;
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
 *
 * <p>The cache is refreshed when it is older than
 * {@code gemini.api-key.cache-ttl-seconds} (default 3600 s / 1 hour), so a
 * rotated key takes effect without a restart.
 */
@Service
public class GenerativeService {

    private static final Logger log = LoggerFactory.getLogger(GenerativeService.class);

    private static final String GEMINI_API_URL =
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    private final SecretManagerService secretManagerService;
    private final HttpClient httpClient;
    private final long cacheTtlMillis;

    // Cached API key and the wall-clock time it was last fetched (epoch ms).
    // Both are volatile so all threads see consistent values.
    private volatile String cachedApiKey;
    private volatile long cachedApiKeyFetchedAt = 0L;

    @Autowired
    public GenerativeService(
            SecretManagerService secretManagerService,
            @Value("${gemini.api-key.cache-ttl-seconds:3600}") long cacheTtlSeconds) {
        this(secretManagerService,
             HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
             cacheTtlSeconds);
    }

    /** Package-private constructor used by unit tests to inject a mock {@link HttpClient}. */
    GenerativeService(SecretManagerService secretManagerService, HttpClient httpClient) {
        this(secretManagerService, httpClient, 3600L);
    }

    /** Full constructor; all public/package-private constructors delegate here. */
    GenerativeService(SecretManagerService secretManagerService,
                      HttpClient httpClient,
                      long cacheTtlSeconds) {
        if (cacheTtlSeconds <= 0) {
            throw new IllegalArgumentException(
                    "gemini.api-key.cache-ttl-seconds must be > 0 (got " + cacheTtlSeconds + ")");
        }
        this.secretManagerService = secretManagerService;
        this.httpClient = httpClient;
        this.cacheTtlMillis = cacheTtlSeconds * 1_000L;
    }

    @PostConstruct
    void logConfiguration() {
        log.info("GenerativeService: Gemini API key cache TTL = {} s ({} min). "
                        + "The key will be re-fetched from Secret Manager after this window.",
                cacheTtlMillis / 1_000L, cacheTtlMillis / 60_000L);
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
     * Fetches the API key from Secret Manager on the first call and caches it;
     * the cache is refreshed after the configured TTL has elapsed.
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

    /**
     * Returns the cached API key, refreshing it from Secret Manager if:
     * <ul>
     *   <li>it has never been fetched (first call), or</li>
     *   <li>the cache is older than {@link #cacheTtlMillis}.</li>
     * </ul>
     *
     * <p>Two threads may both observe an expired cache and both re-fetch; that is
     * harmless — both write the same (rotated) value and subsequent calls see it.
     */
    private String resolveApiKey() throws IOException {
        long now = System.currentTimeMillis();
        if (cachedApiKey == null || (now - cachedApiKeyFetchedAt) >= cacheTtlMillis) {
            log.info("Fetching GEMINI_API_KEY from Secret Manager "
                    + "(cache is absent or older than {} s).", cacheTtlMillis / 1_000L);
            cachedApiKey = secretManagerService.getSecret("GEMINI_API_KEY");
            cachedApiKeyFetchedAt = System.currentTimeMillis();
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
