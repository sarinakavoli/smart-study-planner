package com.sarina.studyplanner.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.sarina.studyplanner.dto.CategoryRequest;
import com.sarina.studyplanner.entity.Category;
import com.sarina.studyplanner.repository.CategoryRep;

@Service
public class CategoryService {

    private final CategoryRep categoryRep;

    public CategoryService(CategoryRep categoryRep) {
        this.categoryRep = categoryRep;
    }

    public List<Category> getAllCategories() {
        return categoryRep.findAllByOrderByDisplayOrderAscIdAsc();
    }

    public Category createCategory(CategoryRequest request) {
        String normalizedName = request.getName().trim().toUpperCase();

        if (categoryRep.existsByName(normalizedName)) {
            throw new RuntimeException("Category already exists.");
        }

        Integer nextOrder = categoryRep.findAll().stream()
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