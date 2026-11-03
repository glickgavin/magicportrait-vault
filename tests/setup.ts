// Unit tests always use fixtures and never real services.
process.env.DATA_SOURCE = "fixtures";
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "fixtures";
process.env.GIFT_LINK_SECRET = process.env.GIFT_LINK_SECRET || "test-gift-link-secret-that-is-at-least-32-bytes-long";
process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret";
