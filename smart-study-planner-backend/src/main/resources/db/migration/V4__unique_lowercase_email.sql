UPDATE courses
SET user_id = dedup.min_id
FROM (
    SELECT id AS dup_id,
           MIN(id) OVER (PARTITION BY LOWER(email)) AS min_id
    FROM users
    WHERE email IS NOT NULL
) AS dedup
WHERE courses.user_id = dedup.dup_id
  AND dedup.dup_id != dedup.min_id;

UPDATE tasks
SET user_id = dedup.min_id
FROM (
    SELECT id AS dup_id,
           MIN(id) OVER (PARTITION BY LOWER(email)) AS min_id
    FROM users
    WHERE email IS NOT NULL
) AS dedup
WHERE tasks.user_id = dedup.dup_id
  AND dedup.dup_id != dedup.min_id;

DELETE FROM users
WHERE email IS NOT NULL
  AND id NOT IN (
      SELECT MIN(id)
      FROM users
      WHERE email IS NOT NULL
      GROUP BY LOWER(email)
  );

CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));
