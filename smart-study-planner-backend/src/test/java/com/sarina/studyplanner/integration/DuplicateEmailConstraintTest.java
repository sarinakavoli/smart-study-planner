@Disabled("Requires Docker/Testcontainers; skipped in GitHub Actions")
package com.sarina.studyplanner.integration;

import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.repository.UserRep;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.Disabled;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertThrows;

// Tag: "integration" — starts a real PostgreSQL container via Testcontainers.
// Skip locally with: mvn test -DexcludedGroups=integration
// Run only this test with: mvn test -Dgroups=integration
@Tag("integration")
@SpringBootTest
@Testcontainers
@Timeout(value = 300, unit = TimeUnit.SECONDS)
@TestPropertySource(properties = {
        "app.flyway.locations=classpath:db/migration",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect",
        "spring.jpa.show-sql=false",
        "spring.jpa.properties.hibernate.format_sql=false",
        "gemini.api.key="
})
class DuplicateEmailConstraintTest {

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

    @Autowired
    private UserRep userRep;

    @Test
    void insertingTwoUsersWhoseEmailsDifferOnlyInCase_throwsConstraintViolation() {
        userRep.saveAndFlush(new User("user_lower", "user@example.com", "password1"));

        assertThrows(DataIntegrityViolationException.class, () ->
                userRep.saveAndFlush(new User("user_upper", "User@Example.com", "password2"))
        );
    }
}
