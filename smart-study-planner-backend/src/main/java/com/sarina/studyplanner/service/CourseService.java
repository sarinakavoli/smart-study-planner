package com.sarina.studyplanner.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.sarina.studyplanner.dto.CourseRequest;
import com.sarina.studyplanner.entity.Course;
import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.exception.CourseNotFoundException;
import com.sarina.studyplanner.exception.UserNotFoundException;
import com.sarina.studyplanner.repository.CourseRep;
import com.sarina.studyplanner.repository.UserRep;

@Service
public class CourseService {

    private final CourseRep courseRepository;
    private final UserRep userRepository;

    public CourseService(CourseRep courseRepository, UserRep userRepository) {
        this.courseRepository = courseRepository;
        this.userRepository = userRepository;
    }

    public Course createCourse(CourseRequest courseRequest) {
        User user = userRepository.findById(courseRequest.getUserId())
                .orElseThrow(() -> new UserNotFoundException(courseRequest.getUserId()));

        Course course = new Course();
        course.setCourseName(courseRequest.getCourseName());
        course.setCourseCode(courseRequest.getCourseCode());
        course.setUser(user);

        return courseRepository.save(course);
    }

    public List<Course> getAllCourses() {
        return courseRepository.findAll();
    }

    public List<Course> getCoursesByUserId(Long userId) {
        if (!userRepository.existsById(userId)) {
            throw new UserNotFoundException(userId);
        }
        return courseRepository.findByUserId(userId);
    }

    public Course getCourseByUserIdAndCourseId(Long userId, Long courseId) {
        if (!userRepository.existsById(userId)) {
            throw new UserNotFoundException(userId);
        }
        return courseRepository.findByIdAndUserId(courseId, userId)
                .orElseThrow(() -> new CourseNotFoundException(courseId));
    }
}
