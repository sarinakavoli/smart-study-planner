package com.sarina.studyplanner;

import org.junit.jupiter.api.Disabled;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@Disabled("Skipped in CI because GitHub has no PGHOST database env")
class SmartStudyPlannerApplicationTests {

	@Test
	void contextLoads() {
	}

}
