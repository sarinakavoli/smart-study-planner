package com.sarina.studyplanner.controller;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SpaController {

    @GetMapping(value = "/{path:[^\\.]*}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<Resource> forward() {
        Resource resource = new ClassPathResource("static/index.html");
        return ResponseEntity.ok(resource);
    }
}
