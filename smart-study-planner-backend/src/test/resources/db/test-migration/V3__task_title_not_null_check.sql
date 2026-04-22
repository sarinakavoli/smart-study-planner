UPDATE tasks
    SET title = 'Untitled'
    WHERE title IS NULL OR TRIM(title) = '';

ALTER TABLE tasks
    ALTER COLUMN title SET NOT NULL;

ALTER TABLE tasks
    ADD CONSTRAINT chk_task_title_not_blank CHECK (TRIM(title) <> '');
