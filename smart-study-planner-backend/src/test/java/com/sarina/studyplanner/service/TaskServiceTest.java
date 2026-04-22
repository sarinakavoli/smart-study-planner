package com.sarina.studyplanner.service;

import com.sarina.studyplanner.dto.TaskRequest;
import com.sarina.studyplanner.entity.Course;
import com.sarina.studyplanner.entity.Task;
import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.repository.CourseRep;
import com.sarina.studyplanner.repository.TaskRep;
import com.sarina.studyplanner.repository.UserRep;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TaskServiceTest {

    @Mock
    private TaskRep taskRepository;

    @Mock
    private CourseRep courseRepository;

    @Mock
    private UserRep userRepository;

    @InjectMocks
    private TaskService taskService;

    private User user;
    private Course course;
    private Task task;

    @BeforeEach
    void setUp() {
        user = new User("alice", "alice@example.com", "password123");

        course = new Course();
        course.setCourseName("Math 101");
        course.setCourseCode("MTH101");

        task = new Task();
        task.setTitle("Read chapter 3");
        task.setStatus("PENDING");
        task.setUser(user);
    }

    @Test
    void createTask_withoutUserOrCourse_savesTask() {
        TaskRequest request = new TaskRequest();
        request.setTitle("Simple task");
        request.setStatus("PENDING");

        when(taskRepository.save(any(Task.class))).thenAnswer(inv -> inv.getArgument(0));

        Task result = taskService.createTask(request);

        assertThat(result.getTitle()).isEqualTo("Simple task");
        assertThat(result.getStatus()).isEqualTo("PENDING");
        verify(taskRepository).save(any(Task.class));
    }

    @Test
    void createTask_defaultsStatusToPending_whenStatusIsNull() {
        TaskRequest request = new TaskRequest();
        request.setTitle("No-status task");

        when(taskRepository.save(any(Task.class))).thenAnswer(inv -> inv.getArgument(0));

        Task result = taskService.createTask(request);

        assertThat(result.getStatus()).isEqualTo("PENDING");
    }

    @Test
    void createTask_withValidUserId_linksUser() {
        TaskRequest request = new TaskRequest();
        request.setTitle("User task");
        request.setUserId(1L);

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(taskRepository.save(any(Task.class))).thenAnswer(inv -> inv.getArgument(0));

        Task result = taskService.createTask(request);

        assertThat(result.getUser()).isEqualTo(user);
    }

    @Test
    void createTask_withInvalidUserId_throwsException() {
        TaskRequest request = new TaskRequest();
        request.setTitle("Bad user task");
        request.setUserId(99L);

        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> taskService.createTask(request))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("User not found");

        verify(taskRepository, never()).save(any());
    }

    @Test
    void createTask_withValidCourseId_linksCourse() {
        TaskRequest request = new TaskRequest();
        request.setTitle("Course task");
        request.setCourseId(2L);

        when(courseRepository.findById(2L)).thenReturn(Optional.of(course));
        when(taskRepository.save(any(Task.class))).thenAnswer(inv -> inv.getArgument(0));

        Task result = taskService.createTask(request);

        assertThat(result.getCourse()).isEqualTo(course);
    }

    @Test
    void getAllTasks_withUserId_returnsTasksForUser() {
        when(taskRepository.findByUser_Id(1L)).thenReturn(List.of(task));

        List<Task> result = taskService.getAllTasks(1L);

        assertThat(result).containsExactly(task);
        verify(taskRepository).findByUser_Id(1L);
        verify(taskRepository, never()).findAll();
    }

    @Test
    void getAllTasks_withNullUserId_returnsAllTasks() {
        when(taskRepository.findAll()).thenReturn(List.of(task));

        List<Task> result = taskService.getAllTasks(null);

        assertThat(result).containsExactly(task);
        verify(taskRepository).findAll();
    }

    @Test
    void getTasksByCourseId_delegatesToRepository() {
        when(taskRepository.findByCourseId(2L)).thenReturn(List.of(task));

        List<Task> result = taskService.getTasksByCourseId(2L);

        assertThat(result).containsExactly(task);
    }

    @Test
    void getTasksByStatus_withUserId_filtersCorrectly() {
        when(taskRepository.findByUser_IdAndStatus(1L, "DONE")).thenReturn(List.of(task));

        List<Task> result = taskService.getTasksByStatus(1L, "DONE");

        assertThat(result).containsExactly(task);
        verify(taskRepository).findByUser_IdAndStatus(1L, "DONE");
    }

    @Test
    void getTasksByStatus_withNullUserId_findsAllByStatus() {
        when(taskRepository.findByStatus("IN_PROGRESS")).thenReturn(List.of(task));

        List<Task> result = taskService.getTasksByStatus(null, "IN_PROGRESS");

        assertThat(result).containsExactly(task);
        verify(taskRepository).findByStatus("IN_PROGRESS");
    }

    @Test
    void getOverdueTasks_withUserId_queriesCorrectly() {
        when(taskRepository.findByUser_IdAndDueDateBeforeAndStatusNot(eq(1L), any(LocalDate.class), eq("DONE")))
                .thenReturn(List.of(task));

        List<Task> result = taskService.getOverdueTasks(1L);

        assertThat(result).containsExactly(task);
    }

    @Test
    void getOverdueTasks_withNullUserId_queriesAllUsers() {
        when(taskRepository.findByDueDateBeforeAndStatusNot(any(LocalDate.class), eq("DONE")))
                .thenReturn(List.of(task));

        List<Task> result = taskService.getOverdueTasks(null);

        assertThat(result).containsExactly(task);
    }

    @Test
    void updateTaskStatus_withValidId_updatesAndSavesTask() {
        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(taskRepository.save(task)).thenReturn(task);

        Task result = taskService.updateTaskStatus(1L, "DONE");

        assertThat(result.getStatus()).isEqualTo("DONE");
        verify(taskRepository).save(task);
    }

    @Test
    void updateTaskStatus_withInvalidId_throwsException() {
        when(taskRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> taskService.updateTaskStatus(99L, "DONE"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Task not found");
    }

    @Test
    void updateTask_withValidId_updatesAllFields() {
        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(taskRepository.save(task)).thenReturn(task);

        TaskRequest request = new TaskRequest();
        request.setTitle("Updated title");
        request.setDescription("Updated description");
        request.setStatus("IN_PROGRESS");
        request.setCategory("WORK");
        request.setDueDate(LocalDate.of(2025, 12, 31));

        Task result = taskService.updateTask(1L, request);

        assertThat(result.getTitle()).isEqualTo("Updated title");
        assertThat(result.getDescription()).isEqualTo("Updated description");
        assertThat(result.getStatus()).isEqualTo("IN_PROGRESS");
        assertThat(result.getCategory()).isEqualTo("WORK");
    }

    @Test
    void updateTask_withInvalidId_throwsException() {
        when(taskRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> taskService.updateTask(99L, new TaskRequest()))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Task not found");
    }

    @Test
    void deleteTask_delegatesToRepository() {
        taskService.deleteTask(5L);

        verify(taskRepository).deleteById(5L);
    }

    @Test
    void moveCategoryToOther_withUserId_updatesMatchingTasks() {
        Task t1 = new Task();
        t1.setCategory("MATH");
        Task t2 = new Task();
        t2.setCategory("MATH");
        when(taskRepository.findByUser_IdAndCategory(1L, "MATH")).thenReturn(List.of(t1, t2));

        taskService.moveCategoryToOther("MATH", 1L);

        assertThat(t1.getCategory()).isEqualTo("OTHER");
        assertThat(t2.getCategory()).isEqualTo("OTHER");
        verify(taskRepository).saveAll(List.of(t1, t2));
    }

    @Test
    void moveCategoryToOther_withNullUserId_updatesAllMatchingTasks() {
        Task t1 = new Task();
        t1.setCategory("SCIENCE");
        when(taskRepository.findByCategory("SCIENCE")).thenReturn(List.of(t1));

        taskService.moveCategoryToOther("SCIENCE", null);

        assertThat(t1.getCategory()).isEqualTo("OTHER");
        verify(taskRepository).saveAll(List.of(t1));
    }

    @Test
    void moveCategoryToOther_withBlankCategory_throwsException() {
        assertThatThrownBy(() -> taskService.moveCategoryToOther("", 1L))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Category is required");

        verify(taskRepository, never()).saveAll(any());
    }

    @Test
    void moveCategoryToOther_withNullCategory_throwsException() {
        assertThatThrownBy(() -> taskService.moveCategoryToOther(null, 1L))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Category is required");
    }
}
