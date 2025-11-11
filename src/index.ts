import { makeTownsBot } from "@towns-protocol/bot";
import { Hono } from "hono";
import { logger } from "hono/logger";
import commands from "./commands";
import { handleGhIssue } from "./handlers/gh-issue-handler";
import { handleGhPr } from "./handlers/gh-pr-handler";
import { handleGithubSubscription } from "./handlers/github-subscription-handler";
import { pollingService } from "./services/polling-service";
import { dbService } from "./db";

const bot = await makeTownsBot(
  process.env.APP_PRIVATE_DATA!,
  process.env.JWT_SECRET!,
  {
    commands,
  }
);

// ============================================================================
// SLASH COMMAND HANDLERS
// ============================================================================

bot.onSlashCommand("help", async (handler, { channelId }) => {
  await handler.sendMessage(
    channelId,
    "**GitHub Bot for Towns**\n\n" +
      "**Subscription Commands:**\n" +
      "• `/github subscribe owner/repo` - Subscribe to GitHub events (checked every 5 min)\n" +
      "• `/github unsubscribe owner/repo` - Unsubscribe from a repository\n" +
      "• `/github status` - Show current subscriptions\n\n" +
      "**Query Commands:**\n" +
      "• `/gh_pr owner/repo #123 [--full]` - Show single PR details\n" +
      "• `/gh_pr list owner/repo [count] [--state=...] [--author=...]` - List PRs\n" +
      "• `/gh_issue owner/repo #123 [--full]` - Show single issue details\n" +
      "• `/gh_issue list owner/repo [count] [--state=...] [--creator=...]` - List issues\n" +
      "• Filters: --state=open|closed|merged|all, --author/--creator=username\n\n" +
      "**Other Commands:**\n" +
      "• `/help` - Show this help message"
  );
});

bot.onSlashCommand("github", async (handler, event) => {
  await handleGithubSubscription(handler, event);
});

bot.onSlashCommand("gh_pr", handleGhPr);

bot.onSlashCommand("gh_issue", handleGhIssue);

// ============================================================================
// START BOT & SETUP HONO APP
// ============================================================================

const { jwtMiddleware, handler } = bot.start();

const app = new Hono();
app.use(logger());

// Towns webhook endpoint
app.post("/webhook", jwtMiddleware, handler);

// Health check endpoint
app.get("/health", async c => {
  const repos = await dbService.getAllSubscribedRepos();
  return c.json({
    status: "ok",
    subscribed_repos: repos.length,
    polling_active: true,
  });
});

// ============================================================================
// START POLLING SERVICE
// ============================================================================

// Set the function used to send messages to Towns channels
pollingService.setSendMessageFunction(async (channelId, message) => {
  await bot.sendMessage(channelId, message);
});

// Start polling for GitHub events
pollingService.start();

console.log("✅ GitHub polling service started (5 minute intervals)");

export default app;
