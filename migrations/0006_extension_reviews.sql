CREATE TABLE extension_reviews (
 student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 mission INTEGER NOT NULL CHECK(mission IN (1,2)),
 status TEXT NOT NULL CHECK(status IN ('running','done','failed')),
 job_id TEXT NOT NULL,
 source_hash TEXT NOT NULL,
 result TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 PRIMARY KEY(student_id,mission)
);
