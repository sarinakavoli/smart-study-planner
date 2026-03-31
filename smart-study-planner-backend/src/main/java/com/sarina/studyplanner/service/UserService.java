package com.sarina.studyplanner.service;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.repository.UserRep;

@Service
public class UserService {

    private final UserRep userRepository;

    public UserService(UserRep userRepository) {
        this.userRepository = userRepository;
    }

    public User login(String name, String password) {
        String normalized = name.toLowerCase();
        Optional<User> existing = userRepository.findByName(normalized);
        if (existing.isEmpty()) {
            throw new RuntimeException("No account found with that username.");
        }
        User user = existing.get();
        if (!password.equals(user.getPassword())) {
            throw new RuntimeException("Incorrect password.");
        }
        return user;
    }

    public User register(String name, String password) {
        String normalized = name.toLowerCase();
        if (userRepository.findByName(normalized).isPresent()) {
            throw new RuntimeException("That username is already taken.");
        }
        User newUser = new User();
        newUser.setName(normalized);
        newUser.setPassword(password);
        newUser.setEmail("");
        return userRepository.save(newUser);
    }

    public User createUser(User user) {
        return userRepository.save(user);
    }

    public List<User> getAllUsers() {
        return userRepository.findAll();
    }
}
