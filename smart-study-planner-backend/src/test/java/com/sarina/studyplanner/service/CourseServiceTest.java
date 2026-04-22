package com.sarina.studyplanner.service;

import com.sarina.studyplanner.dto.CourseRequest;
import com.sarina.studyplanner.entity.Course;
import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.exception.CourseNotFoundException;
import com.sarina.studyplanner.repository.CourseRep;
import com.sarina.studyplanner.repository.UserRep;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CourseServiceTest {

    @Mock
    private CourseRep courseRepository;

    @Mock
    private UserRep userRepository;

    @InjectMocks
    private CourseService courseService;

    private User user;

    @BeforeEach
    void setUp() {
        user = new User("alice", "alice@example.com", "password123");
    }

    @Test
    void createCourse_withValidRequest_savesAndReturnsCourse() {
        CourseRequest request = new CourseRequest();
        request.setUserId(1L);
        request.setCourseName("Math 101");
        request.setCourseCode("MTH101");

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));

        Course savedCourse = new Course();
        savedCourse.setCourseName("Math 101");
        savedCourse.setCourseCode("MTH101");
        savedCourse.setUser(user);
        when(courseRepository.save(any(Course.class))).thenReturn(savedCourse);

        Course result = courseService.createCourse(request);

        assertThat(result.getCourseName()).isEqualTo("Math 101");
        assertThat(result.getCourseCode()).isEqualTo("MTH101");
        assertThat(result.getUser()).isEqualTo(user);
        verify(courseRepository).save(any(Course.class));
    }

    @Test
    void createCourse_whenUserNotFound_throwsException() {
        CourseRequest request = new CourseRequest();
        request.setUserId(99L);
        request.setCourseName("Physics");
        request.setCourseCode("PHY101");

        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> courseService.createCourse(request))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("User not found");

        verify(courseRepository, never()).save(any());
    }

    @Test
    void getAllCourses_returnsAllCourses() {
        Course c1 = new Course();
        c1.setCourseName("Math");
        Course c2 = new Course();
        c2.setCourseName("Science");
        when(courseRepository.findAll()).thenReturn(List.of(c1, c2));

        List<Course> result = courseService.getAllCourses();

        assertThat(result).hasSize(2);
        verify(courseRepository).findAll();
    }

    @Test
    void getCoursesByUserId_delegatesToRepository() {
        Course c1 = new Course();
        c1.setCourseName("History");
        when(userRepository.existsById(1L)).thenReturn(true);
        when(courseRepository.findByUserId(1L)).thenReturn(List.of(c1));

        List<Course> result = courseService.getCoursesByUserId(1L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getCourseName()).isEqualTo("History");
        verify(courseRepository).findByUserId(1L);
    }

    @Test
    void getCoursesByUserId_withNoMatchingCourses_returnsEmptyList() {
        when(userRepository.existsById(42L)).thenReturn(true);
        when(courseRepository.findByUserId(42L)).thenReturn(List.of());

        List<Course> result = courseService.getCoursesByUserId(42L);

        assertThat(result).isEmpty();
    }

    @Test
    void getCoursesByUserId_whenUserNotFound_throwsException() {
        when(userRepository.existsById(999L)).thenReturn(false);

        assertThatThrownBy(() -> courseService.getCoursesByUserId(999L))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("User not found");

        verify(courseRepository, never()).findByUserId(any());
    }

    @Test
    void getCourseByUserIdAndCourseId_withNonExistentCourseId_throwsCourseNotFoundException() {
        when(userRepository.existsById(1L)).thenReturn(true);
        when(courseRepository.findByIdAndUserId(99L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> courseService.getCourseByUserIdAndCourseId(1L, 99L))
                .isInstanceOf(CourseNotFoundException.class)
                .hasMessageContaining("Course not found with id: 99");
    }
}
