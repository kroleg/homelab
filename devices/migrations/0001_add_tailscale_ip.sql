ALTER TABLE "devices" ADD COLUMN "tailscale_ip" text;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_tailscale_ip_unique" UNIQUE("tailscale_ip");
