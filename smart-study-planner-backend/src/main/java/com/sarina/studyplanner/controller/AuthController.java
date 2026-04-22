package com.sarina.studyplanner.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.service.UserService;

import jakarta.servlet.http.HttpSession;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body, HttpSession session) {
        String name = body.get("username");
        String password = body.get("password");

        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username is required."));
        }
        if (password == null || password.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Password is required."));
        }

        try {
            User user = userService.login(name.trim(), password);
            session.setAttribute("userId", user.getId());
            return ResponseEntity.ok(Map.of("id", user.getId(), "name", user.getName()));
        } catch (RuntimeException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body, HttpSession session) {
        String name = body.get("username");
        String password = body.get("password");
        String email = body.get("email");

        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username is required."));
        }
        if (password == null || password.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Password is required."));
        }
        if (password.length() < 4) {
            return ResponseEntity.badRequest().body(Map.of("error", "Password must be at least 4 characters."));
        }

        try {
            User user = userService.register(name.trim(), password, email);
            session.setAttribute("userId", user.getId());
            return ResponseEntity.ok(Map.of("id", user.getId(), "name", user.getName()));
        } catch (RuntimeException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        }
    }
}
