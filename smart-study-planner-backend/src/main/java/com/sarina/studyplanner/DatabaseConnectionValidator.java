package com.sarina.studyplanner;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

@Component
public class DatabaseConnectionValidator implements InitializingBean {

    private static final Logger log = LoggerFactory.getLogger(DatabaseConnectionValidator.class);

    private final DataSource dataSource;

    public DatabaseConnectionValidator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void afterPropertiesSet() {
        log.info("Verifying database connectivity before accepting traffic...");
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT 1")) {
            if (rs.next()) {
                log.info("Database connection verified successfully. Application is ready to accept traffic.");
            } else {
                throw new IllegalStateException("Database connectivity check returned no results from 'SELECT 1'.");
            }
        } catch (Exception e) {
            String message = "FATAL: Cannot connect to the database. The application will not start. Cause: " + e.getMessage();
            log.error(message, e);
            throw new IllegalStateException(message, e);
        }
    }
}
