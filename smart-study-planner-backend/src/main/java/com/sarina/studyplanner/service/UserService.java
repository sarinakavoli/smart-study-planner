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

    public User loginOrRegister(String name, String password) {
        Optional<User> existing = userRepository.findByName(name);

        if (existing.isPresent()) {
            User user = existing.get();
            if (!password.equals(user.getPassword())) {
                throw new RuntimeException("Incorrect password.");
            }
            return user;
        }

        User newUser = new User();
        newUser.setName(name);
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
