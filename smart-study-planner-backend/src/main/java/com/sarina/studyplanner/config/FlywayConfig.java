package com.sarina.studyplanner.config;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.springframework.boot.jpa.autoconfigure.EntityManagerFactoryDependsOnPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FlywayConfig {

    @Bean
    public Flyway flyway(DataSource dataSource) {
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load();
        flyway.migrate();
        return flyway;
    }

    @Bean
    public static EntityManagerFactoryDependsOnPostProcessor flywayJpaDependency() {
        return new EntityManagerFactoryDependsOnPostProcessor("flyway");
    }
}
