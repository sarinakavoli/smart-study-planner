package com.sarina.studyplanner.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.sarina.studyplanner.entity.Course;

public interface CourseRep extends JpaRepository<Course, Long> {
    List<Course> findByUserId(Long userId);
    Optional<Course> findByIdAndUserId(Long id, Long userId);
}