package com.sarina.studyplanner;

import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StartupExitCodeTest {

    private static final String JAVA_EXECUTABLE =
            System.getProperty("java.home") + "/bin/java";
    private static final String CLASSPATH =
            System.getProperty("java.class.path");
    private static final String MAIN_CLASS =
            SmartStudyPlannerApplication.class.getName();

    private ProcessResult launchMain(Map<String, String> extraEnv) throws Exception {
        List<String> command = List.of(JAVA_EXECUTABLE, "-cp", CLASSPATH, MAIN_CLASS);
        ProcessBuilder pb = new ProcessBuilder(command);

        pb.environment().remove("PGHOST");
        pb.environment().remove("PGUSER");
        pb.environment().remove("PGPASSWORD");
        pb.environment().putAll(extraEnv);

        pb.redirectErrorStream(true);
        Process process = pb.start();

        String output;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            output = reader.lines().collect(Collectors.joining("\n"));
        }

        boolean finished = process.waitFor(30, java.util.concurrent.TimeUnit.SECONDS);
        int exitCode = finished ? process.exitValue() : -1;
        if (!finished) {
            process.destroyForcibly();
        }

        return new ProcessResult(exitCode, output);
    }

    @Test
    void noCredentials_mainExitsWithCode1() throws Exception {
        ProcessResult result = launchMain(Map.of());

        assertEquals(1, result.exitCode,
                "Application should exit with code 1 when all credentials are missing");
        assertTrue(result.output.contains("PGHOST") || result.output.contains("PGUSER") || result.output.contains("PGPASSWORD"),
                "Error output should mention the missing variable(s); got: " + result.output);
    }

    @Test
    void pgHostMissing_mainExitsWithCode1() throws Exception {
        ProcessResult result = launchMain(Map.of("PGUSER", "admin", "PGPASSWORD", "secret"));

        assertEquals(1, result.exitCode,
                "Application should exit with code 1 when PGHOST is missing");
        assertTrue(result.output.contains("PGHOST"),
                "Error output should mention PGHOST; got: " + result.output);
    }

    @Test
    void pgUserMissing_mainExitsWithCode1() throws Exception {
        ProcessResult result = launchMain(Map.of("PGHOST", "localhost", "PGPASSWORD", "secret"));

        assertEquals(1, result.exitCode,
                "Application should exit with code 1 when PGUSER is missing");
        assertTrue(result.output.contains("PGUSER"),
                "Error output should mention PGUSER; got: " + result.output);
    }

    @Test
    void pgPasswordMissing_mainExitsWithCode1() throws Exception {
        ProcessResult result = launchMain(Map.of("PGHOST", "localhost", "PGUSER", "admin"));

        assertEquals(1, result.exitCode,
                "Application should exit with code 1 when PGPASSWORD is missing");
        assertTrue(result.output.contains("PGPASSWORD"),
                "Error output should mention PGPASSWORD; got: " + result.output);
    }

    @Test
    void allCredentialsPresent_credentialCheckPasses() throws Exception {
        ProcessResult result = launchMain(Map.of(
                "PGHOST", "localhost",
                "PGUSER", "admin",
                "PGPASSWORD", "secret"
        ));

        assertTrue(
                !result.output.contains("Required environment variable(s) not set"),
                "Should not produce the credential-missing error when all vars are set; got: " + result.output
        );
    }

    private record ProcessResult(int exitCode, String output) {}
}
