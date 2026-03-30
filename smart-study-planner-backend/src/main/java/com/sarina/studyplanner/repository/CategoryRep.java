package com.sarina.studyplanner.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.sarina.studyplanner.entity.Category;

public interface CategoryRep extends JpaRepository<Category, Long> {

    Optional<Category> findByName(String name);

    boolean existsByName(String name);

    boolean existsByNameAndUserId(String name, Long userId);

    List<Category> findAllByOrderByDisplayOrderAscIdAsc();

    List<Category> findByUserIdOrderByDisplayOrderAscIdAsc(Long userId);
}
