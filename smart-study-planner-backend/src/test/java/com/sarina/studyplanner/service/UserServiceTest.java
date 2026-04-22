package com.sarina.studyplanner.service;

import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.repository.UserRep;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRep userRepository;

    private BCryptPasswordEncoder passwordEncoder;
    private UserService userService;

    private User existingUser;

    @BeforeEach
    void setUp() {
        passwordEncoder = new BCryptPasswordEncoder();
        userService = new UserService(userRepository, passwordEncoder);
        String hashedPassword = passwordEncoder.encode("password123");
        existingUser = new User("alice", "alice@example.com", hashedPassword);
    }

    @Test
    void login_withValidCredentials_returnsUser() {
        when(userRepository.findByName("alice")).thenReturn(Optional.of(existingUser));

        User result = userService.login("alice", "password123");

        assertThat(result).isEqualTo(existingUser);
    }

    @Test
    void login_normalizesUsernameToLowercase() {
        when(userRepository.findByName("alice")).thenReturn(Optional.of(existingUser));

        User result = userService.login("ALICE", "password123");

        assertThat(result).isEqualTo(existingUser);
        verify(userRepository).findByName("alice");
    }

    @Test
    void login_withUnknownUsername_throwsException() {
        when(userRepository.findByName("unknown")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> userService.login("unknown", "password123"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("No account found with that username");
    }

    @Test
    void login_withWrongPassword_throwsException() {
        when(userRepository.findByName("alice")).thenReturn(Optional.of(existingUser));

        assertThatThrownBy(() -> userService.login("alice", "wrongpassword"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Incorrect password");
    }

    @Test
    void register_withValidData_savesAndReturnsUser() {
        when(userRepository.findByName("bob")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User result = userService.register("bob", "securepass");

        assertThat(result.getName()).isEqualTo("bob");
        assertThat(passwordEncoder.matches("securepass", result.getPassword())).isTrue();
        verify(userRepository).save(any(User.class));
    }

    @Test
    void register_normalizesUsernameToLowercase() {
        when(userRepository.findByName("bob")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User result = userService.register("BOB", "securepass");

        assertThat(result.getName()).isEqualTo("bob");
    }

    @Test
    void register_withShortPassword_throwsException() {
        assertThatThrownBy(() -> userService.register("bob", "short"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("at least 8 characters");

        verify(userRepository, never()).save(any());
    }

    @Test
    void register_withNullPassword_throwsException() {
        assertThatThrownBy(() -> userService.register("bob", null))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("at least 8 characters");
    }

    @Test
    void register_withDuplicateUsername_throwsException() {
        when(userRepository.findByName("alice")).thenReturn(Optional.of(existingUser));

        assertThatThrownBy(() -> userService.register("alice", "password123"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("already taken");

        verify(userRepository, never()).save(any());
    }

    @Test
    void createUser_withShortPassword_throwsException() {
        User user = new User("carol", "carol@example.com", "short");

        assertThatThrownBy(() -> userService.createUser(user))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("at least 8 characters");

        verify(userRepository, never()).save(any());
    }

    @Test
    void createUser_hashesPasswordAndDelegatesToRepository() {
        User user = new User("carol", "carol@example.com", "pass1234");
        when(userRepository.save(user)).thenReturn(user);

        User result = userService.createUser(user);

        assertThat(passwordEncoder.matches("pass1234", result.getPassword())).isTrue();
        verify(userRepository).save(user);
    }

    @Test
    void getAllUsers_returnsAllUsers() {
        List<User> users = List.of(existingUser, new User("bob", "", "pass1234"));
        when(userRepository.findAll()).thenReturn(users);

        List<User> result = userService.getAllUsers();

        assertThat(result).hasSize(2);
    }
}
