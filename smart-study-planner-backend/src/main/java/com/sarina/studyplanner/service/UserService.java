package com.sarina.studyplanner.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.repository.UserRep;

@Service
public class UserService {

    private final UserRep userRepository;

    public UserService(UserRep userRepository) {
        this.userRepository = userRepository;
    }

    public User createUser(User user) {
        return userRepository.save(user);
    }

    public List<User> getAllUsers() {
        return userRepository.findAll();
    }
}