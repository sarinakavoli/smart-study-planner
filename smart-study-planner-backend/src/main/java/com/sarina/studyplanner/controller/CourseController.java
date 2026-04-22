package com.sarina.studyplanner.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.sarina.studyplanner.dto.CourseRequest;
import com.sarina.studyplanner.entity.Course;
import com.sarina.studyplanner.exception.CourseNotFoundException;
import com.sarina.studyplanner.exception.UserNotFoundException;
import com.sarina.studyplanner.service.CourseService;

@RestController
@RequestMapping("/api")
public class CourseController {

    private final CourseService courseService;

    public CourseController(CourseService courseService) {
        this.courseService = courseService;
    }

    @PostMapping("/courses")
    public ResponseEntity<?> createCourse(@RequestBody CourseRequest courseRequest) {
        try {
            Course course = courseService.createCourse(courseRequest);
            return ResponseEntity.ok(course);
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/courses")
    public List<Course> getAllCourses() {
        return courseService.getAllCourses();
    }

    @GetMapping("/users/{userId}/courses")
    public ResponseEntity<?> getCoursesByUserId(@PathVariable Long userId) {
        try {
            List<Course> courses = courseService.getCoursesByUserId(userId);
            return ResponseEntity.ok(courses);
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/users/{userId}/courses/{courseId}")
    public ResponseEntity<?> getCourseByUserIdAndCourseId(
            @PathVariable Long userId,
            @PathVariable Long courseId) {
        try {
            Course course = courseService.getCourseByUserIdAndCourseId(userId, courseId);
            return ResponseEntity.ok(course);
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (CourseNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/users/{userId}/courses/{courseId}")
    public ResponseEntity<?> updateCourse(
            @PathVariable Long userId,
            @PathVariable Long courseId,
            @RequestBody CourseRequest courseRequest) {
        try {
            Course course = courseService.updateCourse(userId, courseId, courseRequest);
            return ResponseEntity.ok(course);
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (CourseNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/users/{userId}/courses/{courseId}")
    public ResponseEntity<?> deleteCourse(
            @PathVariable Long userId,
            @PathVariable Long courseId) {
        try {
            courseService.deleteCourse(userId, courseId);
            return ResponseEntity.noContent().build();
        } catch (UserNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (CourseNotFoundException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        }
    }
}
