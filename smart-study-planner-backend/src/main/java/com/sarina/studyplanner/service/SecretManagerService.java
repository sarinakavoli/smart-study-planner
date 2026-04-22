package com.sarina.studyplanner.service;

import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.auth.oauth2.UserCredentials;
import com.google.cloud.secretmanager.v1.AccessSecretVersionResponse;
import com.google.cloud.secretmanager.v1.SecretManagerServiceClient;
import com.google.cloud.secretmanager.v1.SecretManagerServiceSettings;
import com.google.cloud.secretmanager.v1.SecretVersionName;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * Fetches secrets from Google Secret Manager using OAuth2 user credentials
 * (a refresh token).  This avoids needing a JSON service-account key, which
 * the GCP org policy "iam.disableServiceAccountKeyCreation" would block.
 *
 * ── How authentication works (explained simply) ───────────────────────────
 * Instead of a downloaded JSON key file, we use three values that prove
 * "this server is allowed to act as your Google account":
 *
 *   GOOGLE_CLIENT_ID      – identifies the OAuth2 app you created in GCP Console
 *   GOOGLE_CLIENT_SECRET  – a password for that OAuth2 app
 *   GOOGLE_REFRESH_TOKEN  – a long-lived token obtained when you logged in with
 *                           `gcloud auth application-default login`
 *
 * At runtime, the library exchanges the refresh token for a short-lived access
 * token automatically, so no API call in this class ever uses the raw key.
 *
 * ── GCP setup required before this works ──────────────────────────────────
 * 1. GCP Console → APIs & Services → Credentials →
 *      Create Credentials → OAuth 2.0 Client ID → Desktop app.
 *    Download the JSON; copy client_id and client_secret.
 *
 * 2. IAM & Admin → IAM → find your personal Google account email →
 *    Add role: "Secret Manager Secret Accessor".
 *
 * 3. Run locally (Mac/Linux):
 *      gcloud auth application-default login \
 *        --client-id-file=<path-to-downloaded-json> \
 *        --scopes=https://www.googleapis.com/auth/cloud-platform
 *    Open ~/.config/gcloud/application_default_credentials.json and copy
 *    the "refresh_token" value.
 *
 * 4. Add to Replit Secrets:
 *      GOOGLE_CLIENT_ID
 *      GOOGLE_CLIENT_SECRET
 *      GOOGLE_REFRESH_TOKEN
 *    Add to Replit Environment Variables:
 *      GCP_PROJECT_ID  (value: dev-sarina)
 * ──────────────────────────────────────────────────────────────────────────
 */
@Service
public class SecretManagerService {

    private final String projectId;
    private final String clientId;
    private final String clientSecret;
    private final String refreshToken;

    public SecretManagerService(@Value("${gcp.project.id:}") String projectId) {
        this.projectId     = projectId;
        // Read the three OAuth2 bootstrap credentials from Replit Secrets.
        // These are injected into the process environment by Replit; they are
        // never returned in any HTTP response.
        this.clientId      = System.getenv("GOOGLE_CLIENT_ID");
        this.clientSecret  = System.getenv("GOOGLE_CLIENT_SECRET");
        this.refreshToken  = System.getenv("GOOGLE_REFRESH_TOKEN");
    }

    /**
     * Returns true only when all four required configuration values are present.
     * Call this before {@link #getSecret} to give callers a clear 503 rather
     * than a cryptic NullPointerException.
     */
    public boolean isConfigured() {
        return isPresent(projectId)
                && isPresent(clientId)
                && isPresent(clientSecret)
                && isPresent(refreshToken);
    }

    /**
     * Returns a human-readable description of whichever required values are
     * missing.  Useful for building a helpful 503 error message.
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
     * Fetches the latest version of a secret from Google Secret Manager.
     *
     * The client is opened and closed for each call (try-with-resources), which
     * keeps the code simple and avoids stale connection issues.  The overhead is
     * acceptable because secret fetches happen at most once per app startup
     * (callers cache the result).
     *
     * @param secretId the name of the secret in Secret Manager (e.g. "GEMINI_API_KEY")
     * @return the plaintext secret value
     * @throws IOException if the GCP call fails
     */
    public String getSecret(String secretId) throws IOException {
        // Build OAuth2 user credentials from the three Replit Secrets.
        // The library will automatically refresh the access token when it expires.
        UserCredentials credentials = UserCredentials.newBuilder()
                .setClientId(clientId)
                .setClientSecret(clientSecret)
                .setRefreshToken(refreshToken)
                .build();

        SecretManagerServiceSettings settings = SecretManagerServiceSettings.newBuilder()
                .setCredentialsProvider(FixedCredentialsProvider.create(credentials))
                .build();

        // try-with-resources ensures the gRPC channel is closed after the call
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
