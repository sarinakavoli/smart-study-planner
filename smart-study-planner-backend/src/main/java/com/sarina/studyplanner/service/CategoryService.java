package com.sarina.studyplanner.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.sarina.studyplanner.dto.CategoryRequest;
import com.sarina.studyplanner.entity.Category;
import com.sarina.studyplanner.entity.User;
import com.sarina.studyplanner.repository.CategoryRep;
import com.sarina.studyplanner.repository.UserRep;

@Service
public class CategoryService {

    private final CategoryRep categoryRep;
    private final UserRep userRep;

    public CategoryService(CategoryRep categoryRep, UserRep userRep) {
        this.categoryRep = categoryRep;
        this.userRep = userRep;
    }

    public List<Category> getAllCategories(Long userId) {
        if (userId != null) {
            return categoryRep.findByUser_IdOrderByDisplayOrderAscIdAsc(userId);
        }
        return categoryRep.findAllByOrderByDisplayOrderAscIdAsc();
    }

    public Category createCategory(CategoryRequest request) {
        String normalizedName = request.getName().trim().toUpperCase();
        Long userId = request.getUserId();

        if (userId != null) {
            if (categoryRep.existsByNameAndUser_Id(normalizedName, userId)) {
                throw new RuntimeException("Category already exists.");
            }
        } else {
            if (categoryRep.existsByName(normalizedName)) {
                throw new RuntimeException("Category already exists.");
            }
        }

        List<Category> existing = userId != null
                ? categoryRep.findByUser_IdOrderByDisplayOrderAscIdAsc(userId)
                : categoryRep.findAllByOrderByDisplayOrderAscIdAsc();

        Integer nextOrder = existing.stream()
                .map(Category::getDisplayOrder)
                .filter(v -> v != null)
                .max(Integer::compareTo)
                .orElse(0) + 1;

        Category category = new Category();
        category.setName(normalizedName);
        category.setColor(request.getColor());
        category.setDisplayOrder(
                request.getDisplayOrder() != null ? request.getDisplayOrder() : nextOrder
        );

        if (userId != null) {
            User user = userRep.findById(userId)
                    .orElseThrow(() -> new RuntimeException("User not found."));
            category.setUser(user);
        }

        return categoryRep.save(category);
    }

    public Category updateColor(Long id, CategoryRequest request) {
        Category category = categoryRep.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found."));

        category.setColor(request.getColor());
        return categoryRep.save(category);
    }

    public Category updateOrder(Long id, CategoryRequest request) {
        Category category = categoryRep.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found."));

        category.setDisplayOrder(request.getDisplayOrder());
        return categoryRep.save(category);
    }

    public void deleteCategory(Long id) {
        Category category = categoryRep.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found."));

        categoryRep.delete(category);
    }
}
