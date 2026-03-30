package com.sarina.studyplanner.dto;

import java.time.LocalDate;

public class TaskRequest {

    private String title;
    private String description;
    private LocalDate dueDate;
    private String status;
    private String category;
    private Long courseId;
    private Long userId;

    public TaskRequest() {
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public String getStatus() {
        return status;
    }

    public String getCategory() {
        return category;
    }

    public Long getCourseId() {
        return courseId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public void setCourseId(Long courseId) {
        this.courseId = courseId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }
}
