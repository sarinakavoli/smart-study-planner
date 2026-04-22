package com.sarina.studyplanner.service;

import com.sarina.studyplanner.dto.TaskRequest;
import com.sarina.studyplanner.entity.Task;
import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.exception.CourseNotFoundException;
import com.sarina.studyplanner.exception.TaskNotFoundException;
import com.sarina.studyplanner.exception.UserNotFoundException;
import com.sarina.studyplanner.repository.CourseRep;
import com.sarina.studyplanner.repository.TaskRep;
import com.sarina.studyplanner.repository.UserRep;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
public class TaskService {

    private final TaskRep taskRepository;
    private final CourseRep courseRepository;
    private final UserRep userRepository;

    public TaskService(TaskRep taskRepository, CourseRep courseRepository, UserRep userRepository) {
        this.taskRepository = taskRepository;
        this.courseRepository = courseRepository;
        this.userRepository = userRepository;
    }

    public Task createTask(TaskRequest taskRequest) {
        Task task = new Task();
        task.setTitle(taskRequest.getTitle());
        task.setDescription(taskRequest.getDescription());
        task.setDueDate(taskRequest.getDueDate());
        task.setStatus(taskRequest.getStatus() != null ? taskRequest.getStatus() : "PENDING");
        task.setCategory(taskRequest.getCategory());

        if (taskRequest.getUserId() != null) {
            User user = userRepository.findById(taskRequest.getUserId())
                    .orElseThrow(() -> new UserNotFoundException(taskRequest.getUserId()));
            task.setUser(user);
        }

        if (taskRequest.getCourseId() != null) {
            task.setCourse(courseRepository.findById(taskRequest.getCourseId())
                    .orElseThrow(() -> new CourseNotFoundException(taskRequest.getCourseId())));
        }

        return taskRepository.save(task);
    }

    public List<Task> getAllTasks(Long userId) {
        if (userId != null) {
            return taskRepository.findByUser_Id(userId);
        }
        return taskRepository.findAll();
    }

    public List<Task> getTasksByCourseId(Long courseId) {
        return taskRepository.findByCourseId(courseId);
    }

    public List<Task> getTasksByStatus(Long userId, String status) {
        if (userId != null) {
            return taskRepository.findByUser_IdAndStatus(userId, status);
        }
        return taskRepository.findByStatus(status);
    }

    public List<Task> getOverdueTasks(Long userId) {
        if (userId != null) {
            return taskRepository.findByUser_IdAndDueDateBeforeAndStatusNot(userId, LocalDate.now(), "DONE");
        }
        return taskRepository.findByDueDateBeforeAndStatusNot(LocalDate.now(), "DONE");
    }

    public Task updateTaskStatus(Long taskId, String status) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new TaskNotFoundException(taskId));
        task.setStatus(status);
        return taskRepository.save(task);
    }

    public Task updateTask(Long taskId, TaskRequest taskRequest) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new TaskNotFoundException(taskId));

        task.setTitle(taskRequest.getTitle());
        task.setDescription(taskRequest.getDescription());
        task.setDueDate(taskRequest.getDueDate());
        task.setStatus(taskRequest.getStatus());
        task.setCategory(taskRequest.getCategory());

        if (taskRequest.getCourseId() != null) {
            task.setCourse(courseRepository.findById(taskRequest.getCourseId())
                    .orElseThrow(() -> new CourseNotFoundException(taskRequest.getCourseId())));
        }

        return taskRepository.save(task);
    }

    public void deleteTask(Long taskId) {
        taskRepository.deleteById(taskId);
    }

    public void moveCategoryToOther(String oldCategory, Long userId) {
        if (oldCategory == null || oldCategory.isBlank()) {
            throw new IllegalArgumentException("Category is required");
        }

        List<Task> tasks = userId != null
                ? taskRepository.findByUser_IdAndCategory(userId, oldCategory)
                : taskRepository.findByCategory(oldCategory);

        for (Task task : tasks) {
            task.setCategory("OTHER");
        }

        taskRepository.saveAll(tasks);
    }
}
