package com.sarina.studyplanner.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.sarina.studyplanner.entity.User;

public interface UserRep extends JpaRepository<User, Long> {
    Optional<User> findByName(String name);
    Optional<User> findByNameAndPassword(String name, String password);
}
