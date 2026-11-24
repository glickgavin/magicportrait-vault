import { initBotId } from "botid/client/core";

// Vercel BotID guards only the open store's "Create their picture" request (docs/open-store.md › Limits).
// In development it does nothing; elsewhere it adds a check header to that one request.
initBotId({ protect: [{ path: "/api/store/generations", method: "POST" }] });
