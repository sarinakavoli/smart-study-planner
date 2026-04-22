package com.sarina.studyplanner.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.HashMap;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TaskIntegrationTest {

    @Autowired
    private WebApplicationContext webApplicationContext;

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private Long userId;
    private Long courseId;

    @BeforeEach
    void setUp() throws Exception {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();

        String uniqueName = "taskuser_" + System.nanoTime();
        Map<String, String> registerBody = Map.of("username", uniqueName, "password", "testpass99");
        MvcResult userResult = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerBody)))
                .andExpect(status().isOk())
                .andReturn();
        Map<?, ?> userResponse = objectMapper.readValue(userResult.getResponse().getContentAsString(), Map.class);
        userId = ((Number) userResponse.get("id")).longValue();

        Map<String, Object> courseBody = Map.of(
                "courseName", "Operating Systems",
                "courseCode", "CS401",
                "userId", userId
        );
        MvcResult courseResult = mockMvc.perform(post("/api/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(courseBody)))
                .andExpect(status().isOk())
                .andReturn();
        Map<?, ?> courseResponse = objectMapper.readValue(courseResult.getResponse().getContentAsString(), Map.class);
        courseId = ((Number) courseResponse.get("id")).longValue();
    }

    @Test
    void createTask_persistsToDatabase_andReturnsCreatedTask() throws Exception {
        Map<String, Object> taskBody = Map.of(
                "title", "Write report",
                "description", "End-of-semester report",
                "dueDate", "2026-05-01",
                "category", "HOMEWORK",
                "userId", userId,
                "courseId", courseId
        );

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(taskBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Write report"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.id").isNumber());
    }

    @Test
    void getTasksByUserId_returnsOnlyTasksForThatUser() throws Exception {
        Map<String, Object> taskBody = Map.of(
                "title", "Study for midterm",
                "description", "Review chapters 1-5",
                "dueDate", "2026-04-30",
                "category", "STUDY",
                "userId", userId,
                "courseId", courseId
        );
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(taskBody)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/tasks").param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].title").value("Study for midterm"))
                .andExpect(jsonPath("$[0].status").value("PENDING"));
    }

    @Test
    void createTaskWithoutCourse_persistsSuccessfully() throws Exception {
        Map<String, Object> taskBody = Map.of(
                "title", "General task",
                "description", "No course assigned",
                "dueDate", "2026-06-01",
                "category", "OTHER",
                "userId", userId
        );

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(taskBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("General task"))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void getTasksByStatus_returnsOnlyPendingTasks() throws Exception {
        Map<String, Object> taskBody = Map.of(
                "title", "Assignment submission",
                "description", "Submit final assignment",
                "dueDate", "2026-05-15",
                "category", "ASSIGNMENT",
                "userId", userId,
                "courseId", courseId
        );
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(taskBody)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/tasks/status/PENDING").param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].status").value("PENDING"));
    }

    @Test
    void createTask_withNullTitle_returns400() throws Exception {
        Map<String, Object> taskBody = new HashMap<>();
        taskBody.put("title", null);
        taskBody.put("description", "Some description");
        taskBody.put("dueDate", "2026-05-01");
        taskBody.put("category", "HOMEWORK");
        taskBody.put("userId", userId);
        taskBody.put("courseId", courseId);

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(taskBody)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createTask_withBlankTitle_returns400() throws Exception {
        Map<String, Object> taskBody = Map.of(
                "title", "   ",
                "description", "Some description",
                "dueDate", "2026-05-01",
                "category", "HOMEWORK",
                "userId", userId,
                "courseId", courseId
        );

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(taskBody)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateTask_withNullTitle_returns400() throws Exception {
        Map<String, Object> createBody = Map.of(
                "title", "Valid task title",
                "description", "Initial description",
                "dueDate", "2026-05-01",
                "category", "HOMEWORK",
                "userId", userId,
                "courseId", courseId
        );
        MvcResult createResult = mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isOk())
                .andReturn();
        Map<?, ?> created = objectMapper.readValue(createResult.getResponse().getContentAsString(), Map.class);
        Long taskId = ((Number) created.get("id")).longValue();

        Map<String, Object> updateBody = new HashMap<>();
        updateBody.put("title", null);
        updateBody.put("description", "Updated description");
        updateBody.put("dueDate", "2026-06-01");
        updateBody.put("category", "HOMEWORK");
        updateBody.put("userId", userId);
        updateBody.put("courseId", courseId);

        mockMvc.perform(put("/api/tasks/" + taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateTask_withBlankTitle_returns400() throws Exception {
        Map<String, Object> createBody = Map.of(
                "title", "Another valid task",
                "description", "Initial description",
                "dueDate", "2026-05-01",
                "category", "STUDY",
                "userId", userId,
                "courseId", courseId
        );
        MvcResult createResult = mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isOk())
                .andReturn();
        Map<?, ?> created = objectMapper.readValue(createResult.getResponse().getContentAsString(), Map.class);
        Long taskId = ((Number) created.get("id")).longValue();

        Map<String, Object> updateBody = Map.of(
                "title", "",
                "description", "Updated description",
                "dueDate", "2026-06-01",
                "category", "STUDY",
                "userId", userId,
                "courseId", courseId
        );

        mockMvc.perform(put("/api/tasks/" + taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody)))
                .andExpect(status().isBadRequest());
    }
}
