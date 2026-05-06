package com.sarina.studyplanner.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;
import java.net.URI;

@Configuration
public class DataSourceConfig {

    private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

    @Bean
    @Primary
    public DataSource dataSource() {
        String databaseUrl = System.getenv("DATABASE_URL");

        if (databaseUrl != null && !databaseUrl.isEmpty()) {
            log.info("[DB] DATABASE_URL is set — using it as primary connection source");
            try {
                URI uri = URI.create(databaseUrl);
                String host = uri.getHost();
                int port = uri.getPort() > 0 ? uri.getPort() : 5432;
                String db = uri.getPath().replaceFirst("^/", "");
                String userInfo = uri.getUserInfo();
                String user = userInfo.split(":", 2)[0];
                String password = userInfo.split(":", 2)[1];

                String jdbcUrl = "jdbc:postgresql://" + host + ":" + port + "/" + db;
                log.info("[DB] Parsed DATABASE_URL → host={} port={} db={} user={}", host, port, db, user);

                HikariConfig cfg = buildHikariConfig(jdbcUrl, user, password);
                return new HikariDataSource(cfg);

            } catch (Exception e) {
                log.warn("[DB] Failed to parse DATABASE_URL ({}), falling back to PGHOST vars", e.getMessage());
            }
        } else {
            log.info("[DB] DATABASE_URL not set — using PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD");
        }

        String host = System.getenv("PGHOST");
        String port = nvl(System.getenv("PGPORT"), "5432");
        String db = nvl(System.getenv("PGDATABASE"), "studyplanner");
        String user = System.getenv("PGUSER");
        String password = System.getenv("PGPASSWORD");

        log.info("[DB] PGHOST={} PGPORT={} PGDATABASE={} PGUSER={}", host, port, db, user);

        String jdbcUrl = "jdbc:postgresql://" + host + ":" + port + "/" + db;
        HikariConfig cfg = buildHikariConfig(jdbcUrl, user, password);
        return new HikariDataSource(cfg);
    }

    private static HikariConfig buildHikariConfig(String jdbcUrl, String user, String password) {
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(jdbcUrl);
        cfg.setUsername(user);
        cfg.setPassword(password);
        cfg.setMaxLifetime(600_000);
        cfg.setKeepaliveTime(60_000);
        cfg.setConnectionTimeout(30_000);
        cfg.setMinimumIdle(2);
        return cfg;
    }

    private static String nvl(String value, String fallback) {
        return (value != null && !value.isEmpty()) ? value : fallback;
    }
}
