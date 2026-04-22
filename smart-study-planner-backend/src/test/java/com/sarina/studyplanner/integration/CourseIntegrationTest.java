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

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CourseIntegrationTest {

    @Autowired
    private WebApplicationContext webApplicationContext;

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private Long userId;

    @BeforeEach
    void setUp() throws Exception {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();

        String uniqueName = "courseuser_" + System.nanoTime();
        Map<String, String> registerBody = Map.of("username", uniqueName, "password", "testpass99");
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerBody)))
                .andExpect(status().isOk())
                .andReturn();
        Map<?, ?> response = objectMapper.readValue(result.getResponse().getContentAsString(), Map.class);
        userId = ((Number) response.get("id")).longValue();
    }

    @Test
    void createCourse_persistsToDatabase_andReturnsCreatedCourse() throws Exception {
        Map<String, Object> courseBody = Map.of(
                "courseName", "Algorithms",
                "courseCode", "CS301",
                "userId", userId
        );

        mockMvc.perform(post("/api/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(courseBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.courseName").value("Algorithms"))
                .andExpect(jsonPath("$.courseCode").value("CS301"))
                .andExpect(jsonPath("$.id").isNumber());
    }

    @Test
    void getCoursesByUserId_returnsCoursesBelongingToUser() throws Exception {
        Map<String, Object> courseBody = Map.of(
                "courseName", "Data Structures",
                "courseCode", "CS201",
                "userId", userId
        );
        mockMvc.perform(post("/api/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(courseBody)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/users/" + userId + "/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].courseName").value("Data Structures"))
                .andExpect(jsonPath("$[0].courseCode").value("CS201"));
    }

    @Test
    void createCourseForNonexistentUser_returns404() throws Exception {
        Map<String, Object> courseBody = Map.of(
                "courseName", "Ghost Course",
                "courseCode", "XX999",
                "userId", 999999L
        );

        mockMvc.perform(post("/api/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(courseBody)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void getCoursesByNonexistentUserId_returns404() throws Exception {
        mockMvc.perform(get("/api/users/999999/courses"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void getCourseByNonexistentUserId_returns404() throws Exception {
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
        Long courseId = ((Number) courseResponse.get("id")).longValue();

        mockMvc.perform(get("/api/users/999999/courses/" + courseId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("User not found with id: 999999"));
    }

    @Test
    void getCourseByValidUserIdAndNonexistentCourseId_returns404() throws Exception {
        mockMvc.perform(get("/api/users/" + userId + "/courses/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Course not found with id: 999999"));
    }
}
