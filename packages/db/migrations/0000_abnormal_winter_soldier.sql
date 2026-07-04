CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"lifetime_xp" bigint DEFAULT 0 NOT NULL,
	"season_xp" bigint DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "gateway_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"label" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "gateway_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"streaming" boolean DEFAULT false NOT NULL,
	"tool_use" boolean DEFAULT false NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"stop_reason" text,
	"latency_ms" integer,
	"user_agent" text,
	"session_hint" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_activity" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" bigint DEFAULT 0 NOT NULL,
	"completion_tokens" bigint DEFAULT 0 NOT NULL,
	"providers" text[] DEFAULT '{}' NOT NULL,
	"models" text[] DEFAULT '{}' NOT NULL,
	"tool_use_session" boolean DEFAULT false NOT NULL,
	"deep_session" boolean DEFAULT false NOT NULL,
	"usage_xp_awarded" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_activity_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"user_id" uuid NOT NULL,
	"achievement_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "xp_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"rule_id" text NOT NULL,
	"config_version" text NOT NULL,
	"season_id" text NOT NULL,
	"day" date NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "xp_ledger_amount_nonnegative" CHECK ("xp_ledger"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_copy" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gateway_keys" ADD CONSTRAINT "gateway_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_user_ts_idx" ON "usage_events" USING btree ("user_id","ts");--> statement-breakpoint
CREATE INDEX "xp_ledger_user_day_idx" ON "xp_ledger" USING btree ("user_id","day");