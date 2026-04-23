package com.sarina.studyplanner.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.sarina.studyplanner.config.JwtUtil;
import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.service.UserService;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
    private final JwtUtil jwtUtil;

    public AuthController(UserService userService, JwtUtil jwtUtil) {
        this.userService = userService;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
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
            String token = jwtUtil.generateToken(user.getId());
            Map<String, Object> responseBody = new HashMap<>();
            responseBody.put("id", user.getId());
            responseBody.put("name", user.getName());
            responseBody.put("token", token);
            return ResponseEntity.ok(responseBody);
        } catch (RuntimeException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
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
            String token = jwtUtil.generateToken(user.getId());
            Map<String, Object> responseBody = new HashMap<>();
            responseBody.put("id", user.getId());
            responseBody.put("name", user.getName());
            responseBody.put("token", token);
            return ResponseEntity.ok(responseBody);
        } catch (RuntimeException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        }
    }
}
