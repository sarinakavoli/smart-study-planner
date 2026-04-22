package com.sarina.studyplanner;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.ArrayList;
import java.util.List;

@SpringBootApplication
public class SmartStudyPlannerApplication {

        public static void main(String[] args) {
                List<String> missing = new ArrayList<>();
                for (String var : new String[]{"PGHOST", "PGUSER", "PGPASSWORD"}) {
                        String value = System.getenv(var);
                        if (value == null || value.isEmpty()) {
                                missing.add(var);
                        }
                }
                if (!missing.isEmpty()) {
                        System.err.println("ERROR: Required environment variable(s) not set: " + String.join(", ", missing));
                        System.err.println("The application cannot start without valid database credentials.");
                        System.exit(1);
                }
                SpringApplication.run(SmartStudyPlannerApplication.class, args);
        }

}
