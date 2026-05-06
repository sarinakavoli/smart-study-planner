package com.sarina.studyplanner;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

@SpringBootApplication
public class SmartStudyPlannerApplication {

        static final String[] REQUIRED_CREDENTIALS = {"PGHOST", "PGUSER", "PGPASSWORD"};

        static List<String> getMissingCredentials(Function<String, String> envReader) {
                List<String> missing = new ArrayList<>();
                for (String var : REQUIRED_CREDENTIALS) {
                        String value = envReader.apply(var);
                        if (value == null || value.isEmpty()) {
                                missing.add(var);
                        }
                }
                return missing;
        }

        public static void main(String[] args) {
                // ── Startup DB diagnostics (safe — password is never printed) ──────────
                String databaseUrl = System.getenv("DATABASE_URL");
                if (databaseUrl != null && !databaseUrl.isEmpty()) {
                        try {
                                URI uri = URI.create(databaseUrl);
                                String maskedUrl = databaseUrl.replaceAll(":[^:@/]+@", ":***@");
                                System.out.println("[DB-ENV] DATABASE_URL=" + maskedUrl);
                                System.out.println("[DB-ENV] Parsed host=" + uri.getHost()
                                        + " port=" + (uri.getPort() > 0 ? uri.getPort() : 5432)
                                        + " db=" + uri.getPath().replaceFirst("^/", ""));
                        } catch (Exception e) {
                                System.out.println("[DB-ENV] DATABASE_URL=set (could not parse: " + e.getMessage() + ")");
                        }
                } else {
                        System.out.println("[DB-ENV] DATABASE_URL=(not set)");
                }
                System.out.println("[DB-ENV] PGHOST="     + System.getenv("PGHOST"));
                System.out.println("[DB-ENV] PGPORT="     + System.getenv("PGPORT"));
                System.out.println("[DB-ENV] PGDATABASE=" + System.getenv("PGDATABASE"));
                System.out.println("[DB-ENV] PGUSER="     + System.getenv("PGUSER"));
                System.out.println("[DB-ENV] PGPASSWORD=" + (System.getenv("PGPASSWORD") != null ? "***set***" : "(not set)"));
                // ─────────────────────────────────────────────────────────────────────

                // Skip individual PG var check if DATABASE_URL is available
                if (databaseUrl == null || databaseUrl.isEmpty()) {
                        List<String> missing = getMissingCredentials(System::getenv);
                        if (!missing.isEmpty()) {
                                System.err.println("ERROR: Required environment variable(s) not set: " + String.join(", ", missing));
                                System.err.println("Set DATABASE_URL or individual PGHOST/PGUSER/PGPASSWORD before starting.");
                                System.exit(1);
                        }
                }

                SpringApplication.run(SmartStudyPlannerApplication.class, args);
        }

}
