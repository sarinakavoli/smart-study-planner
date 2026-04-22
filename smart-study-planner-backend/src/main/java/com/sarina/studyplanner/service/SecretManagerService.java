package com.sarina.studyplanner.service;

import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.secretmanager.v1.AccessSecretVersionResponse;
import com.google.cloud.secretmanager.v1.SecretManagerServiceClient;
import com.google.cloud.secretmanager.v1.SecretManagerServiceSettings;
import com.google.cloud.secretmanager.v1.SecretVersionName;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * Fetches secrets from Google Secret Manager using a service account JSON key.
 *
 * The full JSON key content is stored as the GCP_SERVICE_ACCOUNT_JSON Replit Secret.
 * The GCP project is read from the GCP_PROJECT_ID environment variable.
 *
 * What happens at runtime (step by step):
 *  1. Spring reads GCP_PROJECT_ID from the environment (set as a Replit env var).
 *  2. The constructor reads GCP_SERVICE_ACCOUNT_JSON from the environment.
 *  3. On the first call to getSecret(), the JSON is parsed into a GoogleCredentials
 *     object — this is what proves to Google that the server is allowed to read secrets.
 *  4. A Secret Manager client is opened, the secret is fetched, and the client is closed.
 *  5. The caller (GenerativeService) caches the value so step 3–4 only happen once.
 */
@Service
public class SecretManagerService {

    private static final Logger log = LoggerFactory.getLogger(SecretManagerService.class);

    private final String projectId;
    private final String serviceAccountJson;

    @Autowired
    public SecretManagerService(@Value("${gcp.project.id:}") String projectId) {
        this(projectId, System.getenv("GCP_SERVICE_ACCOUNT_JSON"));
    }

    /** Package-private constructor used by unit tests to supply both values directly. */
    SecretManagerService(String projectId, String serviceAccountJson) {
        this.projectId          = projectId;
        this.serviceAccountJson = serviceAccountJson;

        if (isConfigured()) {
            log.info("SecretManagerService: configured (project: {}). "
                    + "Gemini key will be fetched from Secret Manager on first use.", projectId);
        } else {
            log.warn("SecretManagerService: not fully configured — missing: {}. "
                    + "/api/generate will return 503.", missingConfigDescription());
        }
    }

    /**
     * Returns true when both required values are present.
     */
    public boolean isConfigured() {
        return isPresent(projectId) && isPresent(serviceAccountJson);
    }

    /**
     * Returns a comma-separated list of missing required configuration keys.
     */
    public String missingConfigDescription() {
        var missing = new StringBuilder();
        if (!isPresent(projectId))          missing.append("GCP_PROJECT_ID ");
        if (!isPresent(serviceAccountJson)) missing.append("GCP_SERVICE_ACCOUNT_JSON ");
        return missing.toString().trim().replace(" ", ", ");
    }

    /**
     * Fetches the latest version of {@code secretId} from Secret Manager.
     * Opens and closes the gRPC client per call via try-with-resources; callers
     * are expected to cache the result.
     *
     * @param secretId the Secret Manager secret name (e.g. "GEMINI_API_KEY")
     * @return the plaintext secret value
     * @throws IOException if the GCP call fails
     */
    public String getSecret(String secretId) throws IOException {
        // Parse the service account JSON into a credentials object.
        // createScoped() tells Google which APIs this credential is allowed to call.
        GoogleCredentials credentials = buildCredentials();

        SecretManagerServiceSettings settings = SecretManagerServiceSettings.newBuilder()
                .setCredentialsProvider(FixedCredentialsProvider.create(credentials))
                .build();

        try (SecretManagerServiceClient client = createClient(settings)) {
            SecretVersionName versionName =
                    SecretVersionName.of(projectId, secretId, "latest");
            AccessSecretVersionResponse response = client.accessSecretVersion(versionName);
            return response.getPayload().getData().toStringUtf8();
        }
    }

    /**
     * Parses the service account JSON into scoped {@link GoogleCredentials}.
     * Extracted as a protected method so unit tests can override it and avoid real credential
     * parsing.
     */
    protected GoogleCredentials buildCredentials() throws IOException {
        return GoogleCredentials
                .fromStream(new ByteArrayInputStream(
                        serviceAccountJson.getBytes(StandardCharsets.UTF_8)))
                .createScoped(Collections.singletonList(
                        "https://www.googleapis.com/auth/cloud-platform"));
    }

    /**
     * Creates a {@link SecretManagerServiceClient} from the given settings.
     * Extracted as a protected method so unit tests can override it and inject a mock client
     * without making real GCP calls.
     */
    protected SecretManagerServiceClient createClient(SecretManagerServiceSettings settings)
            throws IOException {
        return SecretManagerServiceClient.create(settings);
    }

    private static boolean isPresent(String value) {
        return value != null && !value.isBlank();
    }
}
