@Disabled("Requires Docker/Testcontainers; skipped in GitHub Actions")
package com.sarina.studyplanner;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Disabled;

// Tag: "integration" — starts a real PostgreSQL container via Testcontainers.
// Skip locally with: mvn test -DexcludedGroups=integration
// Run only this test with: mvn test -Dgroups=integration
//
// Timeout strategy:
//   - Container-level: withStartupTimeout(5 min) — Testcontainers throws if
//     postgres:16 has not become ready within that window (guards pull + init).
//   - Class-level @Timeout(300 s) — JUnit 5 applies this to every test method;
//     combined with the container startup timeout it bounds total wall-clock time.
//   - Surefire forkedProcessTimeoutInSeconds=600 in pom.xml is the backstop:
//     it kills the forked JVM if JUnit itself gets stuck outside a test method.
@Tag("integration")
@SpringBootTest
@Testcontainers
@Timeout(value = 300, unit = TimeUnit.SECONDS)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect",
        "spring.jpa.show-sql=false",
        "spring.jpa.properties.hibernate.format_sql=false",
        "gemini.api.key="
})
class PostgreSQLSchemaValidationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16")
            .withStartupTimeout(Duration.ofMinutes(5));

    @DynamicPropertySource
    static void configureDataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
    }

    @Test
    void hibernateSchemaValidationPassesAgainstRealPostgreSQL() {
    }
}
