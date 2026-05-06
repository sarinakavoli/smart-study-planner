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
        // PRIMARY_DATABASE_URL is our own secret — not runtime-managed by Replit.
        // It takes priority so we can point production at helium even when Replit
        // injects a disabled Neon endpoint via the standard DATABASE_URL variable.
        String primaryUrl = System.getenv("PRIMARY_DATABASE_URL");
        if (primaryUrl != null && !primaryUrl.isEmpty()) {
            log.info("[DB] PRIMARY_DATABASE_URL is set — using it as the connection source");
            DataSource ds = buildFromUrl(primaryUrl, "PRIMARY_DATABASE_URL");
            if (ds != null) return ds;
        }

        String databaseUrl = System.getenv("DATABASE_URL");
        if (databaseUrl != null && !databaseUrl.isEmpty()) {
            log.info("[DB] DATABASE_URL is set — using it as primary connection source");
            DataSource ds = buildFromUrl(databaseUrl, "DATABASE_URL");
            if (ds != null) return ds;
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

    private DataSource buildFromUrl(String rawUrl, String sourceName) {
        try {
            URI uri = URI.create(rawUrl);
            String host = uri.getHost();
            int port = uri.getPort() > 0 ? uri.getPort() : 5432;
            String db = uri.getPath().replaceFirst("^/", "");
            String userInfo = uri.getUserInfo();
            String user = userInfo.split(":", 2)[0];
            String password = userInfo.split(":", 2)[1];

            String jdbcUrl = "jdbc:postgresql://" + host + ":" + port + "/" + db;
            log.info("[DB] Parsed {} → host={} port={} db={} user={}", sourceName, host, port, db, user);

            HikariConfig cfg = buildHikariConfig(jdbcUrl, user, password);
            return new HikariDataSource(cfg);
        } catch (Exception e) {
            log.warn("[DB] Failed to parse {} ({}), trying next source", sourceName, e.getMessage());
            return null;
        }
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
        // -1: do not fail pool initialization if the DB is unreachable at startup.
        // Connections are retried at request time. This ensures the app can start
        // and pass the health check even when the DB endpoint is not yet reachable.
        cfg.setInitializationFailTimeout(-1);
        return cfg;
    }

    private static String nvl(String value, String fallback) {
        return (value != null && !value.isEmpty()) ? value : fallback;
    }
}
