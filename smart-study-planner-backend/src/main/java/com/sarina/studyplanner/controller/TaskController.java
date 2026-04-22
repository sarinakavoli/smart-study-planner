package com.sarina.studyplanner.controller;

import com.sarina.studyplanner.dto.TaskRequest;
import com.sarina.studyplanner.entity.Task;
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
        } catch (UserNotFoundException e) {
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
    public Task updateTaskStatus(@PathVariable Long taskId, @RequestBody Map<String, String> body) {
        return taskService.updateTaskStatus(taskId, body.get("status"));
    }

    @PutMapping("/tasks/{taskId}")
    public Task updateTask(@PathVariable Long taskId, @RequestBody TaskRequest taskRequest) {
        return taskService.updateTask(taskId, taskRequest);
    }

    @PutMapping("/tasks/category/move-to-other")
    public String moveCategoryToOther(@RequestBody Map<String, Object> body) {
        String oldCategory = (String) body.get("oldCategory");
        Long userId = body.get("userId") != null ? Long.valueOf(body.get("userId").toString()) : null;
        taskService.moveCategoryToOther(oldCategory, userId);
        return "Category moved to OTHER successfully";
    }

    @DeleteMapping("/tasks/{taskId}")
    public String deleteTask(@PathVariable Long taskId) {
        taskService.deleteTask(taskId);
        return "Task deleted successfully";
    }
}
