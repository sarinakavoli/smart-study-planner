package com.sarina.studyplanner.controller;

import com.sarina.studyplanner.dto.TaskRequest;
import com.sarina.studyplanner.entity.Task;
import com.sarina.studyplanner.service.TaskService;
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
    public Task createTask(@RequestBody TaskRequest taskRequest) {
        return taskService.createTask(taskRequest);
    }

    @GetMapping("/tasks")
    public List<Task> getAllTasks() {
        return taskService.getAllTasks();
    }

    @GetMapping("/courses/{courseId}/tasks")
    public List<Task> getTasksByCourseId(@PathVariable Long courseId) {
        return taskService.getTasksByCourseId(courseId);
    }

    @GetMapping("/tasks/status/{status}")
    public List<Task> getTasksByStatus(@PathVariable String status) {
        return taskService.getTasksByStatus(status);
    }

    @GetMapping("/tasks/overdue")
    public List<Task> getOverdueTasks() {
        return taskService.getOverdueTasks();
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
    public String moveCategoryToOther(@RequestBody Map<String, String> body) {
        taskService.moveCategoryToOther(body.get("oldCategory"));
        return "Category moved to OTHER successfully";
    }

    @DeleteMapping("/tasks/{taskId}")
    public String deleteTask(@PathVariable Long taskId) {
        taskService.deleteTask(taskId);
        return "Task deleted successfully";
    }
}