CREATE TABLE "linkedin_connects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"company_name" text NOT NULL,
	"profile_url" text NOT NULL,
	"profile_name" text NOT NULL,
	"headline" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_detail" text,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linkedin_connects" ADD CONSTRAINT "linkedin_connects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_linkedin_connects_user_id" ON "linkedin_connects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_linkedin_connects_job_id" ON "linkedin_connects" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_linkedin_connects_user_job_profile" ON "linkedin_connects" USING btree ("user_id","job_id","profile_url");