#!/bin/bash
set -e

echo "=== Building frontend ==="
cd smart-study-planner-frontend
npm install
npm run build
cd ..

echo "=== Copying frontend build to backend static resources ==="
rm -rf smart-study-planner-backend/src/main/resources/static/*
cp -r smart-study-planner-frontend/dist/* smart-study-planner-backend/src/main/resources/static/

echo "=== Building backend JAR ==="
cd smart-study-planner-backend
./mvnw clean package -DskipTests

echo "=== Build complete ==="
