DROP INDEX "github_subscriptions_unique_idx";--> statement-breakpoint
DROP INDEX "pending_subscriptions_unique_idx";--> statement-breakpoint
ALTER TABLE "message_mappings" DROP CONSTRAINT "message_mappings_space_id_channel_id_repo_full_name_github_entity_type_github_entity_id_pk";--> statement-breakpoint
ALTER TABLE "github_subscriptions" ALTER COLUMN "space_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message_mappings" ALTER COLUMN "space_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_states" ALTER COLUMN "space_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_subscriptions" ALTER COLUMN "space_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message_mappings" ADD CONSTRAINT "message_mappings_channel_id_repo_full_name_github_entity_type_github_entity_id_pk" PRIMARY KEY("channel_id","repo_full_name","github_entity_type","github_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_subscriptions_unique_idx" ON "github_subscriptions" USING btree ("channel_id","repo_full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_subscriptions_unique_idx" ON "pending_subscriptions" USING btree ("channel_id","repo_full_name");