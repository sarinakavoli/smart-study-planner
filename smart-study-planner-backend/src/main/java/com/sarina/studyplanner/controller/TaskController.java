package com.sarina.studyplanner.controller;

import com.sarina.studyplanner.dto.TaskRequest;
import com.sarina.studyplanner.entity.Task;
import com.sarina.studyplanner.exception.CourseNotFoundException;
import com.sarina.studyplanner.exception.ForbiddenException;
import com.sarina.studyplanner.exception.TaskNotFoundException;
import com.sarina.studyplanner.exception.UserNotFoundException;
import com.sarina.studyplanner.service.TaskService;
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

    @PostMapping("/tasks")
    public ResponseEntity<?> createTask(@RequestBody TaskRequest taskRequest) {
        try {
            Task task = taskService.createTask(taskRequest);
            return ResponseEntity.ok(task);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (CourseNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/tasks")
    public List<Task> getAllTasks(@RequestParam(required = false) Long userId) {
        return taskService.getAllTasks(userId);
    }

    @GetMapping("/courses/{courseId}/tasks")
    public List<Task> getTasksByCourseId(@PathVariable Long courseId) {
        return taskService.getTasksByCourseId(courseId);
    }

    @GetMapping("/tasks/status/{status}")
    public List<Task> getTasksByStatus(
            @PathVariable String status,
            @RequestParam(required = false) Long userId) {
        return taskService.getTasksByStatus(userId, status);
    }

    @GetMapping("/tasks/overdue")
    public List<Task> getOverdueTasks(@RequestParam(required = false) Long userId) {
        return taskService.getOverdueTasks(userId);
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
    public ResponseEntity<?> moveCategoryToOther(@RequestBody Map<String, Object> body) {
        try {
            String oldCategory = (String) body.get("oldCategory");
            Long userId = body.get("userId") != null ? Long.valueOf(body.get("userId").toString()) : null;
            taskService.moveCategoryToOther(oldCategory, userId);
            return ResponseEntity.ok("Category moved to OTHER successfully");
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
            @RequestHeader(value = "X-Requesting-User-Id", required = false) Long requestingUserId,
            @RequestBody TaskRequest taskRequest) {
        try {
            if (requestingUserId == null || !requestingUserId.equals(userId)) {
                throw new ForbiddenException("You are not allowed to modify another user's task.");
            }
            Task task = taskService.updateTaskForUser(userId, taskId, taskRequest);
            return ResponseEntity.ok(task);
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
            @RequestHeader(value = "X-Requesting-User-Id", required = false) Long requestingUserId) {
        try {
            if (requestingUserId == null || !requestingUserId.equals(userId)) {
                throw new ForbiddenException("You are not allowed to modify another user's task.");
            }
            taskService.deleteTaskForUser(userId, taskId);
            return ResponseEntity.noContent().build();
        } catch (ForbiddenException e) {
            return ResponseEntity.status(403).body(Map.of("error", e.getMessage()));
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (TaskNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }
}
