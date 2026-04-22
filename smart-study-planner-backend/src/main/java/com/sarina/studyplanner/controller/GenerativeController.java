package com.sarina.studyplanner.controller;

import com.sarina.studyplanner.service.GenerativeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Secure proxy for the Gemini generative AI API.
 *
 * The browser never touches the Gemini API directly and never sees the API key.
 * Flow:
 *   Browser  →  POST /api/generate  { "prompt": "..." }
 *   Server   →  Gemini API (with the secret key, server-side only)
 *   Server   →  Browser  { "result": "AI response text" }
 */
@RestController
@RequestMapping("/api")
public class GenerativeController {

    private final GenerativeService generativeService;

    public GenerativeController(GenerativeService generativeService) {
        this.generativeService = generativeService;
    }

    /**
     * Accepts a JSON body with a "prompt" field and returns a "result" field.
     * The Gemini API key is never included in the response.
     *
     * Example request body:  { "prompt": "Summarise my pending tasks" }
     * Example response body: { "result": "You have 3 pending tasks..." }
     */
    @PostMapping("/generate")
    public ResponseEntity<?> generate(@RequestBody Map<String, String> body) {
        String prompt = body.get("prompt");

        if (prompt == null || prompt.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "prompt is required"));
        }

        if (!generativeService.isConfigured()) {
            return ResponseEntity.status(503)
                    .body(Map.of("error",
                            "AI features are not enabled. Missing required configuration: "
                            + generativeService.missingConfigDescription()
                            + ". Set GCP_PROJECT_ID as a Replit Environment Variable and "
                            + "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN "
                            + "as Replit Secrets."));
        }

        try {
            String result = generativeService.generate(prompt.trim());
            return ResponseEntity.ok(Map.of("result", result));
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("QUOTA_EXCEEDED")) {
                return ResponseEntity.status(429)
                        .body(Map.of("error",
                                "AI quota exceeded. Please wait a moment and try again."));
            }
            return ResponseEntity.status(502)
                    .body(Map.of("error", "Could not reach the AI service. Please try again."));
        }
    }
}
