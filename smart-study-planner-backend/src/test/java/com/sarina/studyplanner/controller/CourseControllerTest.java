package com.sarina.studyplanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarina.studyplanner.dto.CourseRequest;
import com.sarina.studyplanner.entity.Course;
import com.sarina.studyplanner.exception.UserNotFoundException;
import com.sarina.studyplanner.service.CourseService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class CourseControllerTest {

    private MockMvc mockMvc;

    private ObjectMapper objectMapper;

    @Mock
    private CourseService courseService;

    @InjectMocks
    private CourseController courseController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(courseController).build();
        objectMapper = new ObjectMapper();
    }

    private Course buildCourse(String courseName, String courseCode) {
        Course course = new Course();
        course.setCourseName(courseName);
        course.setCourseCode(courseCode);
        return course;
    }

    @Test
    void getAllCourses_returnsOkWithList() throws Exception {
        Course course = buildCourse("Mathematics", "MATH101");
        when(courseService.getAllCourses()).thenReturn(List.of(course));

        mockMvc.perform(get("/api/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseName").value("Mathematics"))
                .andExpect(jsonPath("$[0].courseCode").value("MATH101"));
    }

    @Test
    void getAllCourses_whenEmpty_returnsOkWithEmptyList() throws Exception {
        when(courseService.getAllCourses()).thenReturn(List.of());

        mockMvc.perform(get("/api/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void getCoursesByUserId_returnsOkWithUserCourses() throws Exception {
        Course course = buildCourse("Biology", "BIO201");
        when(courseService.getCoursesByUserId(1L)).thenReturn(List.of(course));

        mockMvc.perform(get("/api/users/1/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseName").value("Biology"))
                .andExpect(jsonPath("$[0].courseCode").value("BIO201"));
    }

    @Test
    void getCoursesByUserId_whenUserHasNoCourses_returnsOkWithEmptyList() throws Exception {
        when(courseService.getCoursesByUserId(99L)).thenReturn(List.of());

        mockMvc.perform(get("/api/users/99/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void getCoursesByUserId_whenUserNotFound_returns404WithErrorMessage() throws Exception {
        when(courseService.getCoursesByUserId(999L))
                .thenThrow(new UserNotFoundException(999L));

        mockMvc.perform(get("/api/users/999/courses"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("User not found with id: 999"));
    }

    @Test
    void createCourse_returnsOkWithCreatedCourse() throws Exception {
        Course course = buildCourse("Chemistry", "CHEM301");
        when(courseService.createCourse(any(CourseRequest.class))).thenReturn(course);

        Map<String, Object> body = Map.of(
                "courseName", "Chemistry",
                "courseCode", "CHEM301",
                "userId", 1
        );

        mockMvc.perform(post("/api/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.courseName").value("Chemistry"))
                .andExpect(jsonPath("$.courseCode").value("CHEM301"));
    }

    @Test
    void createCourse_whenUserNotFound_returns404WithErrorMessage() throws Exception {
        when(courseService.createCourse(any(CourseRequest.class)))
                .thenThrow(new UserNotFoundException(99L));

        Map<String, Object> body = Map.of(
                "courseName", "Physics",
                "courseCode", "PHYS101",
                "userId", 99
        );

        mockMvc.perform(post("/api/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("User not found with id: 99"));
    }
}
