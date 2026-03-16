package com.sarina.studyplanner.service;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;

import com.sarina.studyplanner.dto.TaskRequest;
import com.sarina.studyplanner.entity.Course;
import com.sarina.studyplanner.entity.Task;
import com.sarina.studyplanner.repository.CourseRep;
import com.sarina.studyplanner.repository.TaskRep;

@Service
public class TaskService {

    private final TaskRep taskRepository;
    private final CourseRep courseRepository;

    public TaskService(TaskRep taskRepository, CourseRep courseRepository) {
        this.taskRepository = taskRepository;
        this.courseRepository = courseRepository;
    }

    public Task createTask(TaskRequest taskRequest) {
        Course course = courseRepository.findById(taskRequest.getCourseId())
                .orElseThrow(() -> new RuntimeException("Course not found"));

        Task task = new Task();
        task.setTitle(taskRequest.getTitle());
        task.setDescription(taskRequest.getDescription());
        task.setDueDate(taskRequest.getDueDate());
        task.setStatus(taskRequest.getStatus());
        task.setCategory(taskRequest.getCategory());
        task.setCourse(course);

        return taskRepository.save(task);
    }

    public List<Task> getAllTasks() {
        return taskRepository.findAll();
    }

    public List<Task> getTasksByCourseId(Long courseId) {
        return taskRepository.findByCourseId(courseId);
    }

    public List<Task> getTasksByStatus(String status) {
        return taskRepository.findByStatus(status);
    }

    public List<Task> getOverdueTasks() {
        return taskRepository.findByDueDateBeforeAndStatusNot(LocalDate.now(), "DONE");
    }

    public Task updateTaskStatus(Long taskId, String status) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found"));

        task.setStatus(status);
        return taskRepository.save(task);
    }

    public void deleteTask(Long taskId) {
        taskRepository.deleteById(taskId);
    }

    public void moveCategoryToOther(String oldCategory) {
        List<Task> tasks = taskRepository.findByCategory(oldCategory);

        for (Task task : tasks) {
            task.setCategory("OTHER");
        }

        taskRepository.saveAll(tasks);
    }
}