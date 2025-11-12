import type { BotHandler } from "@towns-protocol/bot";
import { validateRepo } from "../api/github-client";
import { stripMarkdown } from "../utils/stripper";
import { dbService } from "../db";

interface GithubSubscriptionEvent {
  channelId: string;
  args: string[];
}

export async function handleGithubSubscription(
  handler: BotHandler,
  event: GithubSubscriptionEvent
): Promise<void> {
  const { channelId, args } = event;
  const [action, repoArg] = args;

  if (!action) {
    await handler.sendMessage(
      channelId,
      "**Usage:**\n" +
        "• `/github subscribe owner/repo` - Subscribe to GitHub events\n" +
        "• `/github unsubscribe owner/repo` - Unsubscribe from a repository\n" +
        "• `/github status` - Show current subscriptions"
    );
    return;
  }

  switch (action.toLowerCase()) {
    case "subscribe": {
      if (!repoArg) {
        await handler.sendMessage(
          channelId,
          "❌ Usage: `/github subscribe owner/repo`"
        );
        return;
      }

      // Strip markdown formatting from repo name
      const repo = stripMarkdown(repoArg);

      // Validate repo format
      if (!repo.includes("/") || repo.split("/").length !== 2) {
        await handler.sendMessage(
          channelId,
          "❌ Invalid format. Use: `owner/repo` (e.g., `facebook/react`)"
        );
        return;
      }

      // Check if already subscribed
      const isAlreadySubscribed = await dbService.isSubscribed(channelId, repo);
      if (isAlreadySubscribed) {
        await handler.sendMessage(
          channelId,
          `ℹ️ Already subscribed to **${repo}**`
        );
        return;
      }

      // Validate repo exists
      const isValid = await validateRepo(repo);
      if (!isValid) {
        await handler.sendMessage(
          channelId,
          `❌ Repository **${repo}** not found or is not public`
        );
        return;
      }

      // Store subscription in database
      await dbService.subscribe(channelId, repo);

      await handler.sendMessage(
        channelId,
        `✅ **Subscribed to ${repo}**\n\n` +
          `📡 You'll receive notifications for:\n` +
          `• Pull requests\n` +
          `• Issues\n` +
          `• Commits\n` +
          `• Releases\n` +
          `• CI/CD runs\n` +
          `• Comments\n\n` +
          `⏱️ Events are checked every 5 minutes.\n` +
          `🔗 ${`https://github.com/${repo}`}`
      );
      break;
    }

    case "unsubscribe": {
      if (!repoArg) {
        await handler.sendMessage(
          channelId,
          "❌ Usage: `/github unsubscribe owner/repo`"
        );
        return;
      }

      // Strip markdown formatting from repo name
      const repo = stripMarkdown(repoArg);

      // Validate repo format
      if (!repo.includes("/") || repo.split("/").length !== 2) {
        await handler.sendMessage(
          channelId,
          "❌ Invalid format. Use: `owner/repo` (e.g., `facebook/react`)"
        );
        return;
      }

      // Check if channel has any subscriptions
      const channelRepos = await dbService.getChannelSubscriptions(channelId);
      if (channelRepos.length === 0) {
        await handler.sendMessage(
          channelId,
          "❌ This channel has no subscriptions"
        );
        return;
      }

      // Check if subscribed to this specific repo
      if (!channelRepos.includes(repo)) {
        await handler.sendMessage(
          channelId,
          `❌ Not subscribed to **${repo}**\n\nUse \`/github status\` to see your subscriptions`
        );
        return;
      }

      // Remove subscription
      const success = await dbService.unsubscribe(channelId, repo);

      if (success) {
        await handler.sendMessage(
          channelId,
          `✅ **Unsubscribed from ${repo}**`
        );
      } else {
        await handler.sendMessage(
          channelId,
          `❌ Failed to unsubscribe from **${repo}**`
        );
      }
      break;
    }

    case "status": {
      const repos = await dbService.getChannelSubscriptions(channelId);
      if (repos.length === 0) {
        await handler.sendMessage(
          channelId,
          "📭 **No subscriptions**\n\nUse `/github subscribe owner/repo` to get started"
        );
        return;
      }

      const repoList = repos.map(r => `• ${r}`).join("\n");

      await handler.sendMessage(
        channelId,
        `📬 **Subscribed Repositories (${repos.length}):**\n\n${repoList}\n\n` +
          `⏱️ Checking for events every 5 minutes`
      );
      break;
    }

    default:
      await handler.sendMessage(
        channelId,
        `❌ Unknown action: \`${action}\`\n\n` +
          "**Available actions:**\n" +
          "• `subscribe`\n" +
          "• `unsubscribe`\n" +
          "• `status`"
      );
  }
}
