package com.sarina.studyplanner.controller;

import com.sarina.studyplanner.dto.TaskRequest;
import com.sarina.studyplanner.entity.Task;
import com.sarina.studyplanner.exception.CourseNotFoundException;
import com.sarina.studyplanner.exception.ForbiddenException;
import com.sarina.studyplanner.exception.TaskNotFoundException;
import com.sarina.studyplanner.exception.UserNotFoundException;
import com.sarina.studyplanner.service.TaskService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    private Long requireAuthenticatedUserId(HttpServletRequest request) {
        Long id = (Long) request.getAttribute("authenticatedUserId");
        if (id == null) {
            throw new IllegalStateException("No authenticated user identity found on request.");
        }
        return id;
    }

    @PostMapping("/tasks")
    public ResponseEntity<?> createTask(
            @RequestBody TaskRequest taskRequest,
            HttpServletRequest request) {
        try {
            Long authenticatedUserId = requireAuthenticatedUserId(request);
            taskRequest.setUserId(authenticatedUserId);
            Task task = taskService.createTask(taskRequest);
            return ResponseEntity.ok(task);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (CourseNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/tasks")
    public ResponseEntity<?> getAllTasks(
            @RequestParam(required = false) Long userId,
            HttpServletRequest request) {
        try {
            Long authenticatedUserId = requireAuthenticatedUserId(request);
            if (userId != null && !authenticatedUserId.equals(userId)) {
                return ResponseEntity.status(403).body(Map.of("error", "You can only access your own tasks."));
            }
            return ResponseEntity.ok(taskService.getAllTasks(authenticatedUserId));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/courses/{courseId}/tasks")
    public List<Task> getTasksByCourseId(@PathVariable Long courseId) {
        return taskService.getTasksByCourseId(courseId);
    }

    @GetMapping("/tasks/status/{status}")
    public ResponseEntity<?> getTasksByStatus(
            @PathVariable String status,
            @RequestParam(required = false) Long userId,
            HttpServletRequest request) {
        try {
            Long authenticatedUserId = requireAuthenticatedUserId(request);
            if (userId != null && !authenticatedUserId.equals(userId)) {
                return ResponseEntity.status(403).body(Map.of("error", "You can only access your own tasks."));
            }
            return ResponseEntity.ok(taskService.getTasksByStatus(authenticatedUserId, status));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/tasks/overdue")
    public ResponseEntity<?> getOverdueTasks(
            @RequestParam(required = false) Long userId,
            HttpServletRequest request) {
        try {
            Long authenticatedUserId = requireAuthenticatedUserId(request);
            if (userId != null && !authenticatedUserId.equals(userId)) {
                return ResponseEntity.status(403).body(Map.of("error", "You can only access your own tasks."));
            }
            return ResponseEntity.ok(taskService.getOverdueTasks(authenticatedUserId));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/tasks/{taskId}/status")
    public ResponseEntity<?> updateTaskStatus(@PathVariable Long taskId, @RequestBody Map<String, String> body) {
        try {
            Task task = taskService.updateTaskStatus(taskId, body.get("status"));
            return ResponseEntity.ok(task);
        } catch (TaskNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/tasks/{taskId}")
    public ResponseEntity<?> updateTask(@PathVariable Long taskId, @RequestBody TaskRequest taskRequest) {
        try {
            Task task = taskService.updateTask(taskId, taskRequest);
            return ResponseEntity.ok(task);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (TaskNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (CourseNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/tasks/category/move-to-other")
    public ResponseEntity<?> moveCategoryToOther(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        try {
            Long authenticatedUserId = requireAuthenticatedUserId(request);
            String oldCategory = (String) body.get("oldCategory");
            taskService.moveCategoryToOther(oldCategory, authenticatedUserId);
            return ResponseEntity.ok("Category moved to OTHER successfully");
        } catch (IllegalStateException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/tasks/{taskId}")
    public ResponseEntity<?> deleteTask(@PathVariable Long taskId) {
        try {
            taskService.deleteTask(taskId);
            return ResponseEntity.ok("Task deleted successfully");
        } catch (TaskNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/users/{userId}/tasks/{taskId}")
    public ResponseEntity<?> updateTaskForUser(
            @PathVariable Long userId,
            @PathVariable Long taskId,
            HttpServletRequest request,
            @RequestBody TaskRequest taskRequest) {
        try {
            Long authenticatedUserId = requireAuthenticatedUserId(request);
            if (!authenticatedUserId.equals(userId)) {
                throw new ForbiddenException("You are not allowed to modify another user's task.");
            }
            Task task = taskService.updateTaskForUser(userId, taskId, taskRequest);
            return ResponseEntity.ok(task);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        } catch (ForbiddenException e) {
            return ResponseEntity.status(403).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (TaskNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (CourseNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/users/{userId}/tasks/{taskId}")
    public ResponseEntity<?> deleteTaskForUser(
            @PathVariable Long userId,
            @PathVariable Long taskId,
            HttpServletRequest request) {
        try {
            Long authenticatedUserId = requireAuthenticatedUserId(request);
            if (!authenticatedUserId.equals(userId)) {
                throw new ForbiddenException("You are not allowed to modify another user's task.");
            }
            taskService.deleteTaskForUser(userId, taskId);
            return ResponseEntity.noContent().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        } catch (ForbiddenException e) {
            return ResponseEntity.status(403).body(Map.of("error", e.getMessage()));
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (TaskNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }
}
