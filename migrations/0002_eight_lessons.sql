ALTER TABLE submissions ADD COLUMN answers_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE chat_messages(id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, lesson INTEGER NOT NULL, job_id TEXT NOT NULL, prompt TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX chat_messages_student ON chat_messages(student_id,lesson,created_at);
UPDATE settings SET title='AI Police Lab · By: Dr.Ake' WHERE id=1 AND title='AI Police Lab · รุ่น P4';
