-- Migrate eventThreads data to messageMappings
INSERT INTO message_mappings (
  space_id, channel_id, repo_full_name,
  github_entity_type, github_entity_id,
  towns_message_id, created_at, expires_at
)
SELECT
  space_id, channel_id, repo_full_name,
  anchor_type, anchor_number::text,
  thread_event_id, created_at, expires_at
FROM event_threads
ON CONFLICT (space_id, channel_id, repo_full_name, github_entity_type, github_entity_id)
DO NOTHING;
--> statement-breakpoint
DROP TABLE "event_threads" CASCADE;