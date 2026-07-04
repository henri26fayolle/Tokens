ALTER TABLE "moments" ADD COLUMN "idempotency_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_idempotency_key_unique" UNIQUE("idempotency_key");