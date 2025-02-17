import fs from 'node:fs';
import {
    type AgentRuntime,
    type Client,
    type Content,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    State,
    composeContext,
    elizaLogger,
    generateMessageResponse,
    generateText,
    getEmbeddingZeroVector,
    messageCompletionFooter,
    stringToUuid,
} from '@elizaos/core';
import { App } from '@octokit/app';
import type { Octokit } from '@octokit/core';
import { createNodeMiddleware } from '@octokit/webhooks';
import type { IssuesOpenedEvent } from '@octokit/webhooks-types';
import cors from 'cors';
import express from 'express';
import { type AppSettings, loadSettings } from './settings';

// TODO: use {{knowledge}} template when fixed
export const issueOpenedTemplate = `
# Knowledge
Common type labels names: bug, documentation, duplicate, enhancement, good first issue, help wanted, invalid, question, wontfix
Common priority labels names: high, medium, low, critical, blocking
Best practices for issue triage: categorize issues, verify reproducibility, assign relevant labels, and prioritize based on impact
Key principles of open-source product management: transparency, asynchronous communication, and contributor empowerment

# Background
About {{agentName}}:
{{bio}}
{{lore}}

# Attachments
{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

# Task: Triage a the following Github Issue by defining the priority and type label taking into account the {{agentName}} experience as Product Manager.

## Issue Title
{{title}}

## Issue Body
{{body}}

# Instructions: Define the issue priority and type label depending on the issue title, description and label description. The available labels are (label_name: label_description): 

{{labels}}

# Response: The response must be ONLY a JSON containin the issue priority and lable. Response format should be formatted in a valid JSON block like this:

\`\`\`json\n{ "priority": "high", "type": "bug" }\n\`\`\`
`;

export class GitHubClient {
    private readonly app: App;
    private readonly clients: Map<number, { octokit: Octokit; expiration: number }>;

    constructor(
        private readonly agent: IAgentRuntime,
        settings: AppSettings,
    ) {
        const privateKey = fs.readFileSync(settings.GITHUB_APP_KEY, 'utf8');

        this.app = new App({
            appId: settings.GITHUB_APP_ID,
            privateKey,
            webhooks: {
                secret: settings.GITHUB_WEBHOOK_SECRET,
            },
        });

        this.clients = new Map();

        this.app.webhooks.on('issues.opened', this.handleOpenIssue.bind(this));

        this.app.webhooks.onError((error) => {
            elizaLogger.error('Error processing the Github Webhook:', error);
        });
    }

    public async retriveInstallations() {
        // The installation access token will expire after 1 hour
        // https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app

        for await (const { installation } of this.app.eachInstallation.iterator()) {
            await this.refreshOctokitClient(installation.id);
        }
    }

    private async refreshOctokitClient(id: number) {
        const client = {
            octokit: await this.app.getInstallationOctokit(id),
            expiration: Date.now() + 60 * 60 * 1000,
        };

        this.clients.set(id, client);

        return client;
    }

    private async getOctokitClient(id: number) {
        let client = this.clients.get(id);

        if (!client) {
            throw new Error(`Client not found with Installation ID: ${id}`);
        }

        if (client.expiration < Date.now()) {
            client = await this.refreshOctokitClient(id);
        }

        return client.octokit;
    }

    private async handleOpenIssue({ payload }: { payload: object }) {
        const issue = (payload as IssuesOpenedEvent).issue;
        const repository = (payload as IssuesOpenedEvent).repository;
        const installation = (payload as IssuesOpenedEvent).installation;

        const owner = repository.owner.login;
        const repo = repository.name;

        if (!installation) {
            throw new Error('Missing repository GithubApp installation');
        }

        const octokit = await this.getOctokitClient(installation.id);

        const res = await octokit.request('GET /repos/{owner}/{repo}/labels', {
            owner,
            repo,
        });

        const labels = res.data.reduce(
            (content, label) =>
                `${content}- ${label.name}${label.description ? `: ${label.description}` : ''}\n`,
            '',
        );

        const roomId = stringToUuid(`github-issue-${issue.id}-room`);
        const userId = stringToUuid(issue.user.id);

        this.agent.ensureConnection(userId, roomId, issue.user.name, issue.user.name, 'github');

        const messageId = stringToUuid(`issues-opened-${Date.now().toString()}`);

        const issueContent = `${issue.title}\n${issue.body}`;

        const content: Content = {
            text: issueContent,
            source: 'github',
            url: issue.url,
            inReplyTo: undefined,
        };

        const userMessage = {
            content,
            userId,
            roomId,
            agentId: this.agent.agentId,
        };

        const memory: Memory = {
            id: stringToUuid(`${messageId}-${userId}`),
            ...userMessage,
            agentId: this.agent.agentId,
            userId,
            roomId,
            content,
            createdAt: Date.now(),
        };

        await this.agent.messageManager.addEmbeddingToMemory(memory);
        await this.agent.messageManager.createMemory(memory);

        let state = await this.agent.composeState(userMessage, {
            agentName: this.agent.character.name,
            title: issue.title,
            body: issue.body,
            labels,
        });

        const context = composeContext({
            state,
            template: issueOpenedTemplate,
        });

        const response = await generateMessageResponse({
            runtime: this.agent,
            context,
            modelClass: ModelClass.LARGE,
        });

        const responseMessage: Memory = {
            id: stringToUuid(`${messageId}-${this.agent.agentId}`),
            ...userMessage,
            userId: this.agent.agentId,
            content: response,
            embedding: getEmbeddingZeroVector(),
            createdAt: Date.now(),
        };

        await this.agent.messageManager.createMemory(responseMessage);

        state = await this.agent.updateRecentMessageState(state);

        await this.agent.evaluate(memory, state);

        elizaLogger.info(response.priority);

        await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
            owner,
            repo,
            issue_number: issue.number,
            labels: [response.priority as string, response.type as string],
        });
    }

    public createMiddleware() {
        return createNodeMiddleware(this.app.webhooks, { path: '/api/github/webhooks' });
    }
}

export const GitHubClientInteface: Client = {
    start: async (runtime: IAgentRuntime) => {
        const settings = await loadSettings(runtime);

        elizaLogger.info('GitHub Client start');

        const client = new GitHubClient(runtime, settings);

        await client.retriveInstallations();

        const app = express();

        app.use(cors());

        //@ts-ignore
        app.use(client.createMiddleware());

        app.listen(3000, () => {
            elizaLogger.info('Github Client up & running');
        });

        return client;
    },

    stop: async (_runtime: IAgentRuntime) => {
        elizaLogger.info('GitHub Client stop');
    },
};
