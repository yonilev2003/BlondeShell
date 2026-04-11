-- qa_decisions: add columns if missing (table already exists with base schema)
ALTER TABLE qa_decisions ADD COLUMN IF NOT EXISTS content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE;
ALTER TABLE qa_decisions ADD COLUMN IF NOT EXISTS agent TEXT;
ALTER TABLE qa_decisions ADD COLUMN IF NOT EXISTS decision TEXT;
ALTER TABLE qa_decisions ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE qa_decisions ADD COLUMN IF NOT EXISTS face_similarity_score FLOAT;
ALTER TABLE qa_decisions ADD COLUMN IF NOT EXISTS platform_rules_passed BOOLEAN DEFAULT true;
ALTER TABLE qa_decisions ADD COLUMN IF NOT EXISTS age_check_passed BOOLEAN DEFAULT true;
ALTER TABLE qa_decisions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS qa_decisions_content_item_idx ON qa_decisions(content_item_id);
CREATE INDEX IF NOT EXISTS qa_decisions_decision_idx ON qa_decisions(decision);
