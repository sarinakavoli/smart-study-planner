package com.sarina.studyplanner.dto;

public class CourseRequest {

    private String courseName;
    private String courseCode;
    private Long userId;

    public CourseRequest() {
    }

    public String getCourseName() {
        return courseName;
    }

    public String getCourseCode() {
        return courseCode;
    }

    public Long getUserId() {
        return userId;
    }

    public void setCourseName(String courseName) {
        this.courseName = courseName;
    }

    public void setCourseCode(String courseCode) {
        this.courseCode = courseCode;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }
}
