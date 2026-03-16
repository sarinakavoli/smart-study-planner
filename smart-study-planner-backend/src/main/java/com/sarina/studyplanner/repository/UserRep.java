package com.sarina.studyplanner.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.sarina.studyplanner.entity.User;

public interface UserRep extends JpaRepository<User, Long> {
}