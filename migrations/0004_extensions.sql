CREATE TABLE extension_work (
 student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 mission INTEGER NOT NULL CHECK(mission IN (1,2)),
 status TEXT NOT NULL CHECK(status IN ('started','submitted')),
 findings TEXT NOT NULL DEFAULT '',
 plan TEXT NOT NULL DEFAULT '',
 link TEXT NOT NULL DEFAULT '',
 started_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 submitted_at INTEGER,
 PRIMARY KEY(student_id,mission)
);
