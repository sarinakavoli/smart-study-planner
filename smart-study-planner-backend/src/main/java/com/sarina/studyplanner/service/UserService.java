package com.sarina.studyplanner.service;

import java.util.List;
import java.util.Optional;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.repository.UserRep;

@Service
public class UserService {

    private final UserRep userRepository;
    private final BCryptPasswordEncoder passwordEncoder;

    public UserService(UserRep userRepository, BCryptPasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public User login(String name, String password) {
        String normalized = name.toLowerCase();
        Optional<User> existing = userRepository.findByName(normalized);
        if (existing.isEmpty()) {
            throw new RuntimeException("No account found with that username.");
        }
        User user = existing.get();
        String storedPassword = user.getPassword();

        boolean isHashed = storedPassword != null
                && storedPassword.length() == 60
                && storedPassword.startsWith("$2");
        if (isHashed) {
            if (!passwordEncoder.matches(password, storedPassword)) {
                throw new RuntimeException("Incorrect password.");
            }
        } else {
            if (password == null || !password.equals(storedPassword)) {
                throw new RuntimeException("Incorrect password.");
            }
            user.setPassword(passwordEncoder.encode(password));
            userRepository.save(user);
        }

        return user;
    }

    public User register(String name, String password) {
        String normalized = name.toLowerCase();
        if (password == null || password.length() < 8) {
            throw new RuntimeException("Password must be at least 8 characters.");
        }
        if (userRepository.findByName(normalized).isPresent()) {
            throw new RuntimeException("That username is already taken.");
        }
        User newUser = new User();
        newUser.setName(normalized);
        newUser.setPassword(passwordEncoder.encode(password));
        newUser.setEmail("");
        return userRepository.save(newUser);
    }

    public User createUser(User user) {
        if (user.getPassword() != null) {
            user.setPassword(passwordEncoder.encode(user.getPassword()));
        }
        return userRepository.save(user);
    }

    public List<User> getAllUsers() {
        return userRepository.findAll();
    }
}
