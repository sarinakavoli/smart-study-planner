package com.sarina.studyplanner.service;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.secretmanager.v1.AccessSecretVersionResponse;
import com.google.cloud.secretmanager.v1.SecretManagerServiceClient;
import com.google.cloud.secretmanager.v1.SecretManagerServiceSettings;
import com.google.cloud.secretmanager.v1.SecretPayload;
import com.google.cloud.secretmanager.v1.SecretVersionName;
import com.google.protobuf.ByteString;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SecretManagerServiceTest {

    @Mock
    private SecretManagerServiceClient mockClient;

    @Mock
    private GoogleCredentials mockCredentials;

    // -----------------------------------------------------------------------
    // isConfigured()
    // -----------------------------------------------------------------------

    @Test
    void isConfigured_returnsTrueWhenBothValuesPresent() {
        SecretManagerService service = new SecretManagerService("my-project", "{json}");

        assertThat(service.isConfigured()).isTrue();
    }

    @Test
    void isConfigured_returnsFalseWhenProjectIdIsEmpty() {
        SecretManagerService service = new SecretManagerService("", "{json}");

        assertThat(service.isConfigured()).isFalse();
    }

    @Test
    void isConfigured_returnsFalseWhenProjectIdIsNull() {
        SecretManagerService service = new SecretManagerService(null, "{json}");

        assertThat(service.isConfigured()).isFalse();
    }

    @Test
    void isConfigured_returnsFalseWhenServiceAccountJsonIsEmpty() {
        SecretManagerService service = new SecretManagerService("my-project", "");

        assertThat(service.isConfigured()).isFalse();
    }

    @Test
    void isConfigured_returnsFalseWhenServiceAccountJsonIsNull() {
        SecretManagerService service = new SecretManagerService("my-project", null);

        assertThat(service.isConfigured()).isFalse();
    }

    @Test
    void isConfigured_returnsFalseWhenBothValuesAreMissing() {
        SecretManagerService service = new SecretManagerService("", null);

        assertThat(service.isConfigured()).isFalse();
    }

    // -----------------------------------------------------------------------
    // missingConfigDescription()
    // -----------------------------------------------------------------------

    @Test
    void missingConfigDescription_includesProjectIdWhenMissing() {
        SecretManagerService service = new SecretManagerService("", "{json}");

        assertThat(service.missingConfigDescription()).contains("GCP_PROJECT_ID");
    }

    @Test
    void missingConfigDescription_excludesProjectIdWhenPresent() {
        SecretManagerService service = new SecretManagerService("my-project", "");

        assertThat(service.missingConfigDescription()).doesNotContain("GCP_PROJECT_ID");
    }

    @Test
    void missingConfigDescription_includesServiceAccountJsonWhenMissing() {
        SecretManagerService service = new SecretManagerService("my-project", null);

        assertThat(service.missingConfigDescription()).contains("GCP_SERVICE_ACCOUNT_JSON");
    }

    @Test
    void missingConfigDescription_includesBothKeysWhenBothMissing() {
        SecretManagerService service = new SecretManagerService(null, null);

        String desc = service.missingConfigDescription();
        assertThat(desc).contains("GCP_PROJECT_ID");
        assertThat(desc).contains("GCP_SERVICE_ACCOUNT_JSON");
    }

    @Test
    void missingConfigDescription_isBlankWhenBothValuesPresent() {
        SecretManagerService service = new SecretManagerService("my-project", "{json}");

        assertThat(service.missingConfigDescription()).isEmpty();
    }

    // -----------------------------------------------------------------------
    // getSecret()
    // -----------------------------------------------------------------------

    /**
     * Builds a testable subclass that bypasses real GCP credential parsing and
     * returns the injected mock client instead of opening a real gRPC connection.
     */
    private SecretManagerService stubService(String projectId, SecretManagerServiceClient client) {
        return new SecretManagerService(projectId, "{fake-json}") {
            @Override
            protected GoogleCredentials buildCredentials() {
                return mockCredentials;
            }

            @Override
            protected SecretManagerServiceClient createClient(SecretManagerServiceSettings settings)
                    throws IOException {
                return client;
            }
        };
    }

    @Test
    void getSecret_returnsSecretValueFromMockedClient() throws IOException {
        String expectedValue = "super-secret-api-key";
        AccessSecretVersionResponse response = AccessSecretVersionResponse.newBuilder()
                .setPayload(SecretPayload.newBuilder()
                        .setData(ByteString.copyFromUtf8(expectedValue))
                        .build())
                .build();
        when(mockClient.accessSecretVersion(any(SecretVersionName.class))).thenReturn(response);

        SecretManagerService service = stubService("test-project", mockClient);

        String result = service.getSecret("GEMINI_API_KEY");

        assertThat(result).isEqualTo(expectedValue);
    }

    @Test
    void getSecret_passesCorrectSecretIdToClient() throws IOException {
        AccessSecretVersionResponse response = AccessSecretVersionResponse.newBuilder()
                .setPayload(SecretPayload.newBuilder()
                        .setData(ByteString.copyFromUtf8("value"))
                        .build())
                .build();
        when(mockClient.accessSecretVersion(any(SecretVersionName.class))).thenReturn(response);

        SecretManagerService service = stubService("test-project", mockClient);

        service.getSecret("GEMINI_API_KEY");

        ArgumentCaptor<SecretVersionName> captor = ArgumentCaptor.forClass(SecretVersionName.class);
        verify(mockClient).accessSecretVersion(captor.capture());
        SecretVersionName captured = captor.getValue();
        assertThat(captured.getSecret()).isEqualTo("GEMINI_API_KEY");
        assertThat(captured.getProject()).isEqualTo("test-project");
    }
}
