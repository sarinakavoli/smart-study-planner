package com.sarina.studyplanner;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CredentialValidationTest {

    @Test
    void allCredentialsPresent_returnsEmptyList() {
        Map<String, String> env = Map.of(
                "PGHOST", "localhost",
                "PGUSER", "admin",
                "PGPASSWORD", "secret"
        );

        List<String> missing = SmartStudyPlannerApplication.getMissingCredentials(env::get);

        assertTrue(missing.isEmpty(), "No credentials should be missing when all are set");
    }

    @Test
    void pgHostMissing_isReported() {
        Map<String, String> env = Map.of(
                "PGUSER", "admin",
                "PGPASSWORD", "secret"
        );

        List<String> missing = SmartStudyPlannerApplication.getMissingCredentials(env::get);

        assertEquals(List.of("PGHOST"), missing, "PGHOST should be the only missing credential");
    }

    @Test
    void pgUserMissing_isReported() {
        Map<String, String> env = Map.of(
                "PGHOST", "localhost",
                "PGPASSWORD", "secret"
        );

        List<String> missing = SmartStudyPlannerApplication.getMissingCredentials(env::get);

        assertEquals(List.of("PGUSER"), missing, "PGUSER should be the only missing credential");
    }

    @Test
    void pgPasswordMissing_isReported() {
        Map<String, String> env = Map.of(
                "PGHOST", "localhost",
                "PGUSER", "admin"
        );

        List<String> missing = SmartStudyPlannerApplication.getMissingCredentials(env::get);

        assertEquals(List.of("PGPASSWORD"), missing, "PGPASSWORD should be the only missing credential");
    }

    @Test
    void allCredentialsMissing_allAreReported() {
        List<String> missing = SmartStudyPlannerApplication.getMissingCredentials(key -> null);

        assertEquals(
                List.of("PGHOST", "PGUSER", "PGPASSWORD"),
                missing,
                "All three required credentials should be reported as missing"
        );
    }

    @Test
    void emptyStringCredential_isTreatedAsMissing() {
        Map<String, String> env = Map.of(
                "PGHOST", "",
                "PGUSER", "admin",
                "PGPASSWORD", "secret"
        );

        List<String> missing = SmartStudyPlannerApplication.getMissingCredentials(env::get);

        assertEquals(List.of("PGHOST"), missing, "An empty PGHOST should be treated as missing");
    }
}
