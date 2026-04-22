package com.sarina.studyplanner.service;

import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.auth.oauth2.UserCredentials;
import com.google.cloud.secretmanager.v1.AccessSecretVersionResponse;
import com.google.cloud.secretmanager.v1.SecretManagerServiceClient;
import com.google.cloud.secretmanager.v1.SecretManagerServiceSettings;
import com.google.cloud.secretmanager.v1.SecretVersionName;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * Fetches secrets from Google Secret Manager using OAuth2 user credentials.
 * Authenticates via GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and
 * GOOGLE_REFRESH_TOKEN (Replit Secrets) rather than a service-account JSON key.
 * The GCP project is read from the GCP_PROJECT_ID environment variable.
 */
@Service
public class SecretManagerService {

    private static final Logger log = LoggerFactory.getLogger(SecretManagerService.class);

    private final String projectId;
    private final String clientId;
    private final String clientSecret;
    private final String refreshToken;

    public SecretManagerService(@Value("${gcp.project.id:}") String projectId) {
        this.projectId    = projectId;
        this.clientId     = System.getenv("GOOGLE_CLIENT_ID");
        this.clientSecret = System.getenv("GOOGLE_CLIENT_SECRET");
        this.refreshToken = System.getenv("GOOGLE_REFRESH_TOKEN");

        if (isConfigured()) {
            log.info("SecretManagerService: configured (project: {}). "
                    + "Gemini key will be fetched from Secret Manager on first use.", projectId);
        } else {
            log.warn("SecretManagerService: not fully configured — missing: {}. "
                    + "/api/generate will return 503.", missingConfigDescription());
        }
    }

    /**
     * Returns true when all four required values are present.
     */
    public boolean isConfigured() {
        return isPresent(projectId)
                && isPresent(clientId)
                && isPresent(clientSecret)
                && isPresent(refreshToken);
    }

    /**
     * Returns a comma-separated list of missing required configuration keys.
     */
    public String missingConfigDescription() {
        var missing = new StringBuilder();
        if (!isPresent(projectId))    missing.append("GCP_PROJECT_ID ");
        if (!isPresent(clientId))     missing.append("GOOGLE_CLIENT_ID ");
        if (!isPresent(clientSecret)) missing.append("GOOGLE_CLIENT_SECRET ");
        if (!isPresent(refreshToken)) missing.append("GOOGLE_REFRESH_TOKEN ");
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
        UserCredentials credentials = UserCredentials.newBuilder()
                .setClientId(clientId)
                .setClientSecret(clientSecret)
                .setRefreshToken(refreshToken)
                .build();

        SecretManagerServiceSettings settings = SecretManagerServiceSettings.newBuilder()
                .setCredentialsProvider(FixedCredentialsProvider.create(credentials))
                .build();

        try (SecretManagerServiceClient client = SecretManagerServiceClient.create(settings)) {
            SecretVersionName versionName =
                    SecretVersionName.of(projectId, secretId, "latest");
            AccessSecretVersionResponse response = client.accessSecretVersion(versionName);
            return response.getPayload().getData().toStringUtf8();
        }
    }

    private static boolean isPresent(String value) {
        return value != null && !value.isBlank();
    }
}
