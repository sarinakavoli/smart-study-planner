package com.sarina.studyplanner.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.sarina.studyplanner.dto.TaskRequest;
import com.sarina.studyplanner.entity.Task;
import com.sarina.studyplanner.service.TaskService;

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