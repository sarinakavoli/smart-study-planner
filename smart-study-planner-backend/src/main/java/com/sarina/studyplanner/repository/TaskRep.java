package com.sarina.studyplanner.repository;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.sarina.studyplanner.entity.Task;

public interface TaskRep extends JpaRepository<Task, Long> {
    List<Task> findByUser_Id(Long userId);
    List<Task> findByUser_IdAndStatus(Long userId, String status);
    List<Task> findByUser_IdAndDueDateBeforeAndStatusNot(Long userId, LocalDate dueDate, String status);
    List<Task> findByUser_IdAndCategory(Long userId, String category);
    List<Task> findByCourseId(Long courseId);
    List<Task> findByStatus(String status);
    List<Task> findByDueDateBeforeAndStatusNot(LocalDate dueDate, String status);
    List<Task> findByCategory(String category);
}
