import { db, dbService } from "../db";
import { githubInstallations, installationRepositories } from "../db/schema";
import { eq, and } from "drizzle-orm";
import type {
  InstallationCreatedEvent,
  InstallationDeletedEvent,
  InstallationRepositoriesAddedEvent,
  InstallationRepositoriesRemovedEvent,
} from "@octokit/webhooks-types";

interface TownsBot {
  sendMessage: (channelId: string, message: string) => Promise<unknown>;
}

/**
 * InstallationService - Manages GitHub App installation lifecycle
 *
 * Handles installation created/deleted events and repository changes.
 * Stores installation data in normalized tables (no JSON columns).
 */
export class InstallationService {
  private bot: TownsBot | null;

  constructor(bot: TownsBot | null) {
    this.bot = bot;
  }

  /**
   * Handle GitHub App installation created event
   */
  async handleInstallationCreated(
    event: InstallationCreatedEvent
  ): Promise<void> {
    const { installation, repositories } = event;

    console.log(
      `GitHub App installed: ${installation.account.login} (${installation.id})`
    );

    // Store installation in database
    await db.insert(githubInstallations).values({
      installationId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      installedAt: new Date(),
      suspendedAt: null,
      appSlug: installation.app_slug || "towns-github-bot",
    });

    // Store repositories in normalized table
    for (const repo of repositories) {
      await db.insert(installationRepositories).values({
        installationId: installation.id,
        repoFullName: repo.full_name,
        addedAt: new Date(),
      });
    }

    // Notify subscribed channels about new installation
    if (this.bot) {
      for (const repo of repositories) {
        const channels = await dbService.getRepoSubscribers(repo.full_name);
        for (const channel of channels) {
          await this.bot.sendMessage(
            channel.channelId,
            `✅ GitHub App installed for ${repo.full_name}! Switching to real-time webhook delivery.`
          );
        }
      }
    }
  }

  /**
   * Handle GitHub App installation deleted event
   */
  async handleInstallationDeleted(
    event: InstallationDeletedEvent
  ): Promise<void> {
    const { installation } = event;

    console.log(
      `GitHub App uninstalled: ${installation.account.login} (${installation.id})`
    );

    // Get repos before deletion
    const repos = await this.getInstallationRepos(installation.id);

    // Remove from database (CASCADE deletes repositories)
    await db
      .delete(githubInstallations)
      .where(eq(githubInstallations.installationId, installation.id));

    // Notify channels
    if (this.bot) {
      for (const repo of repos) {
        const channels = await dbService.getRepoSubscribers(repo);
        for (const channel of channels) {
          await this.bot.sendMessage(
            channel.channelId,
            `⚠️ GitHub App uninstalled for ${repo}. Falling back to polling mode.`
          );
        }
      }
    }
  }

  /**
   * Handle repositories added to installation
   */
  async handleRepositoriesAdded(
    event: InstallationRepositoriesAddedEvent
  ): Promise<void> {
    const { installation, repositories_added } = event;

    console.log(
      `Repositories added to installation ${installation.id}: ${repositories_added.map(r => r.full_name).join(", ")}`
    );

    // Add new repositories to normalized table
    for (const repo of repositories_added) {
      await db
        .insert(installationRepositories)
        .values({
          installationId: installation.id,
          repoFullName: repo.full_name,
          addedAt: new Date(),
        })
        .onConflictDoNothing();
    }

    // Notify subscribed channels
    if (this.bot) {
      for (const repo of repositories_added) {
        const channels = await dbService.getRepoSubscribers(repo.full_name);
        for (const channel of channels) {
          await this.bot.sendMessage(
            channel.channelId,
            `✅ GitHub App enabled for ${repo.full_name}! Switching to real-time webhook delivery.`
          );
        }
      }
    }
  }

  /**
   * Handle repositories removed from installation
   */
  async handleRepositoriesRemoved(
    event: InstallationRepositoriesRemovedEvent
  ): Promise<void> {
    const { installation, repositories_removed } = event;

    console.log(
      `Repositories removed from installation ${installation.id}: ${repositories_removed.map(r => r.full_name).join(", ")}`
    );

    // Remove repositories from normalized table
    for (const repo of repositories_removed) {
      await db
        .delete(installationRepositories)
        .where(
          and(
            eq(installationRepositories.installationId, installation.id),
            eq(installationRepositories.repoFullName, repo.full_name)
          )
        );
    }

    // Notify subscribed channels
    if (this.bot) {
      for (const repo of repositories_removed) {
        const channels = await dbService.getRepoSubscribers(repo.full_name);
        for (const channel of channels) {
          await this.bot.sendMessage(
            channel.channelId,
            `⚠️ GitHub App disabled for ${repo.full_name}. Falling back to polling mode.`
          );
        }
      }
    }
  }

  /**
   * Get all repositories for an installation
   */
  async getInstallationRepos(installationId: number): Promise<string[]> {
    const repos = await db
      .select()
      .from(installationRepositories)
      .where(eq(installationRepositories.installationId, installationId));

    return repos.map(r => r.repoFullName);
  }

  /**
   * Check if a repository has GitHub App installed
   * Returns installation ID if installed, null otherwise
   */
  async isRepoInstalled(repo: string): Promise<number | null> {
    // Query normalized table with proper indexing
    const installation = await db
      .select()
      .from(installationRepositories)
      .where(eq(installationRepositories.repoFullName, repo))
      .limit(1);

    return installation[0]?.installationId ?? null;
  }
}
