package com.sarina.studyplanner;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

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
                List<String> missing = getMissingCredentials(System::getenv);
                if (!missing.isEmpty()) {
                        System.err.println("ERROR: Required environment variable(s) not set: " + String.join(", ", missing));
                        System.err.println("The application cannot start without valid database credentials.");
                        System.exit(1);
                }
                SpringApplication.run(SmartStudyPlannerApplication.class, args);
        }

}
