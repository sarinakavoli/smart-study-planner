CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    password VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS courses (
    id BIGSERIAL PRIMARY KEY,
    course_name VARCHAR(255),
    course_code VARCHAR(255),
    user_id BIGINT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255),
    description VARCHAR(255),
    due_date DATE,
    status VARCHAR(255),
    category VARCHAR(255),
    course_id BIGINT REFERENCES courses(id),
    user_id BIGINT REFERENCES users(id)
);
