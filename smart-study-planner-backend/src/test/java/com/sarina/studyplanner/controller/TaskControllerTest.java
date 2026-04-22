package com.sarina.studyplanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarina.studyplanner.entity.Task;
import com.sarina.studyplanner.exception.TaskNotFoundException;
import com.sarina.studyplanner.exception.UserNotFoundException;
import com.sarina.studyplanner.service.TaskService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class TaskControllerTest {

    @ControllerAdvice
    static class RuntimeExceptionHandler {
        @ExceptionHandler(RuntimeException.class)
        @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
        void handleRuntimeException() {
        }
    }

    private MockMvc mockMvc;

    private ObjectMapper objectMapper;

    @Mock
    private TaskService taskService;

    @InjectMocks
    private TaskController taskController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(taskController)
                .setControllerAdvice(new RuntimeExceptionHandler())
                .build();
        objectMapper = new ObjectMapper();
    }

    private Task buildTask(String title, String status) {
        Task task = new Task();
        task.setTitle(title);
        task.setStatus(status);
        return task;
    }

    @Test
    void getAllTasks_returnsOkWithList() throws Exception {
        Task task = buildTask("Read chapter 3", "PENDING");
        when(taskService.getAllTasks(null)).thenReturn(List.of(task));

        mockMvc.perform(get("/api/tasks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Read chapter 3"));
    }

    @Test
    void getAllTasks_withUserId_filtersCorrectly() throws Exception {
        Task task = buildTask("User task", "PENDING");
        when(taskService.getAllTasks(5L)).thenReturn(List.of(task));

        mockMvc.perform(get("/api/tasks").param("userId", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("User task"));
    }

    @Test
    void createTask_returnsOkWithCreatedTask() throws Exception {
        Task task = buildTask("New task", "PENDING");
        when(taskService.createTask(any())).thenReturn(task);

        Map<String, Object> body = Map.of(
                "title", "New task",
                "status", "PENDING"
        );

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("New task"))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void getTasksByCourseId_returnsOk() throws Exception {
        Task task = buildTask("Course task", "PENDING");
        when(taskService.getTasksByCourseId(3L)).thenReturn(List.of(task));

        mockMvc.perform(get("/api/courses/3/tasks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Course task"));
    }

    @Test
    void getTasksByStatus_returnsOk() throws Exception {
        Task task = buildTask("Done task", "DONE");
        when(taskService.getTasksByStatus(null, "DONE")).thenReturn(List.of(task));

        mockMvc.perform(get("/api/tasks/status/DONE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("DONE"));
    }

    @Test
    void getOverdueTasks_returnsOk() throws Exception {
        Task task = buildTask("Overdue task", "PENDING");
        when(taskService.getOverdueTasks(null)).thenReturn(List.of(task));

        mockMvc.perform(get("/api/tasks/overdue"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Overdue task"));
    }

    @Test
    void updateTaskStatus_returnsOkWithUpdatedTask() throws Exception {
        Task updated = buildTask("Task", "DONE");
        when(taskService.updateTaskStatus(1L, "DONE")).thenReturn(updated);

        Map<String, String> body = Map.of("status", "DONE");

        mockMvc.perform(put("/api/tasks/1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DONE"));
    }

    @Test
    void updateTask_returnsOkWithUpdatedTask() throws Exception {
        Task updated = buildTask("Updated title", "IN_PROGRESS");
        when(taskService.updateTask(eq(1L), any())).thenReturn(updated);

        Map<String, Object> body = Map.of(
                "title", "Updated title",
                "status", "IN_PROGRESS"
        );

        mockMvc.perform(put("/api/tasks/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Updated title"));
    }

    @Test
    void deleteTask_returnsOkWithSuccessMessage() throws Exception {
        doNothing().when(taskService).deleteTask(1L);

        mockMvc.perform(delete("/api/tasks/1"))
                .andExpect(status().isOk())
                .andExpect(content().string("Task deleted successfully"));
    }

    @Test
    void moveCategoryToOther_returnsOkWithSuccessMessage() throws Exception {
        doNothing().when(taskService).moveCategoryToOther(eq("MATH"), isNull());

        Map<String, Object> body = Map.of("oldCategory", "MATH");

        mockMvc.perform(put("/api/tasks/category/move-to-other")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(content().string("Category moved to OTHER successfully"));
    }

    @Test
    void moveCategoryToOther_withBlankCategory_returns400WithErrorBody() throws Exception {
        doThrow(new IllegalArgumentException("Category is required"))
                .when(taskService).moveCategoryToOther(eq("   "), isNull());

        Map<String, Object> body = Map.of("oldCategory", "   ");

        mockMvc.perform(put("/api/tasks/category/move-to-other")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Category is required"));
    }

    @Test
    void moveCategoryToOther_withMissingCategory_returns400WithErrorBody() throws Exception {
        doThrow(new IllegalArgumentException("Category is required"))
                .when(taskService).moveCategoryToOther(isNull(), isNull());

        Map<String, Object> body = Map.of();

        mockMvc.perform(put("/api/tasks/category/move-to-other")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Category is required"));
    }

    @Test
    void updateTaskStatus_whenTaskNotFound_returns404WithErrorBody() throws Exception {
        when(taskService.updateTaskStatus(eq(99L), any()))
                .thenThrow(new TaskNotFoundException(99L));

        Map<String, String> body = Map.of("status", "DONE");

        mockMvc.perform(put("/api/tasks/99/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Task not found with id: 99"));
    }

    @Test
    void updateTask_whenTaskNotFound_returns404WithErrorBody() throws Exception {
        when(taskService.updateTask(eq(99L), any()))
                .thenThrow(new TaskNotFoundException(99L));

        Map<String, Object> body = Map.of("title", "Updated", "status", "DONE");

        mockMvc.perform(put("/api/tasks/99")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Task not found with id: 99"));
    }

    @Test
    void deleteTask_whenTaskNotFound_returns404WithErrorBody() throws Exception {
        doThrow(new TaskNotFoundException(99L)).when(taskService).deleteTask(99L);

        mockMvc.perform(delete("/api/tasks/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Task not found with id: 99"));
    }

    @Test
    void createTask_whenUserNotFound_returns404WithErrorBody() throws Exception {
        when(taskService.createTask(any()))
                .thenThrow(new UserNotFoundException(99L));

        Map<String, Object> body = Map.of("title", "Task", "userId", 99);

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("User not found with id: 99"));
    }

    @Test
    void createTask_whenTitleIsBlank_returns400WithErrorBody() throws Exception {
        when(taskService.createTask(any()))
                .thenThrow(new IllegalArgumentException("Title is required"));

        Map<String, Object> body = Map.of("title", "   ", "status", "PENDING");

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Title is required"));
    }

    @Test
    void updateTask_whenTitleIsBlank_returns400WithErrorBody() throws Exception {
        when(taskService.updateTask(eq(1L), any()))
                .thenThrow(new IllegalArgumentException("Title is required"));

        Map<String, Object> body = Map.of("title", "", "status", "PENDING");

        mockMvc.perform(put("/api/tasks/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Title is required"));
    }
}
