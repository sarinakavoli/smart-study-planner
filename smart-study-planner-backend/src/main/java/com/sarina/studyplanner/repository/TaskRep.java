package com.sarina.studyplanner.repository;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.sarina.studyplanner.entity.Task;

public interface TaskRep extends JpaRepository<Task, Long> {
    List<Task> findByUserId(Long userId);
    List<Task> findByUserIdAndStatus(Long userId, String status);
    List<Task> findByUserIdAndDueDateBeforeAndStatusNot(Long userId, LocalDate dueDate, String status);
    List<Task> findByUserIdAndCategory(Long userId, String category);
    List<Task> findByCourseId(Long courseId);
    List<Task> findByStatus(String status);
    List<Task> findByDueDateBeforeAndStatusNot(LocalDate dueDate, String status);
    List<Task> findByCategory(String category);
}
