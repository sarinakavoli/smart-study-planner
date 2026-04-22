package com.sarina.studyplanner.service;

import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.secretmanager.v1.AccessSecretVersionResponse;
import com.google.cloud.secretmanager.v1.SecretManagerServiceClient;
import com.google.cloud.secretmanager.v1.SecretManagerServiceSettings;
import com.google.cloud.secretmanager.v1.SecretVersionName;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Fetches secrets from Google Cloud Secret Manager at runtime.
 *
 * Authentication uses a GCP Service Account whose JSON key is stored as the
 * Replit Secret GCP_SERVICE_ACCOUNT_JSON.  The project to look up secrets in
 * is configured via the GCP_PROJECT_ID environment variable.
 *
 * Neither the service account JSON nor any fetched secret value is ever
 * included in an HTTP response returned to the browser.
 */
@Service
public class SecretManagerService {

    private final String projectId;
    private final String serviceAccountJson;

    public SecretManagerService(@Value("${gcp.project.id:}") String projectId) {
        this.projectId = projectId;
        this.serviceAccountJson = System.getenv("GCP_SERVICE_ACCOUNT_JSON");
    }

    /**
     * Returns true when both the GCP project ID and the service account
     * credentials JSON are present in the environment.
     */
    public boolean isConfigured() {
        return projectId != null && !projectId.isBlank()
                && serviceAccountJson != null && !serviceAccountJson.isBlank();
    }

    /**
     * Fetches the latest version of a secret from Google Cloud Secret Manager.
     *
     * A new authenticated client is created for each call so that credentials
     * stay short-lived and are not held open in memory longer than necessary.
     *
     * @param secretId the name of the secret in Secret Manager, e.g. "GEMINI_API_KEY"
     * @return the secret's plaintext string value
     * @throws IllegalStateException if the service is not configured
     * @throws IOException           if authentication or the API call fails
     */
    public String getSecret(String secretId) throws IOException {
        if (!isConfigured()) {
            throw new IllegalStateException(
                    "Google Cloud Secret Manager is not configured. " +
                    "Set the GCP_PROJECT_ID environment variable and the " +
                    "GCP_SERVICE_ACCOUNT_JSON Replit Secret.");
        }

        GoogleCredentials credentials = GoogleCredentials
                .fromStream(new ByteArrayInputStream(
                        serviceAccountJson.getBytes(StandardCharsets.UTF_8)))
                .createScoped(List.of("https://www.googleapis.com/auth/cloud-platform"));

        SecretManagerServiceSettings settings = SecretManagerServiceSettings.newBuilder()
                .setCredentialsProvider(FixedCredentialsProvider.create(credentials))
                .build();

        try (SecretManagerServiceClient client = SecretManagerServiceClient.create(settings)) {
            SecretVersionName versionName =
                    SecretVersionName.of(projectId, secretId, "latest");
            AccessSecretVersionResponse response =
                    client.accessSecretVersion(versionName);
            return response.getPayload().getData().toStringUtf8();
        }
    }
}
