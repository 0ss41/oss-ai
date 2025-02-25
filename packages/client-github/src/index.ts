import fs from 'node:fs';
import {
    type Client,
    type Content,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    composeContext,
    elizaLogger,
    generateMessageResponse,
    getEmbeddingZeroVector,
    stringToUuid,
} from '@elizaos/core';
import { App } from '@octokit/app';
import type { Octokit } from '@octokit/core';
import { createNodeMiddleware } from '@octokit/webhooks';
import type {
    DiscussionCreatedEvent,
    InstallationLite,
    IssuesOpenedEvent,
} from '@octokit/webhooks-types';
import { DiscussionsClient, IssuesClient, ReposClient } from './clients';
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

    issues: IssuesClient;
    repos: ReposClient;
    discussions: DiscussionsClient;

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

        this.repos = new ReposClient(this);
        this.issues = new IssuesClient(this);
        this.discussions = new DiscussionsClient(this);

        this.app.webhooks.on('issues.opened', this.handleOpenIssue.bind(this));
        this.app.webhooks.on('discussion.created', this.handleOpenDiscussion.bind(this));

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

    public async getOctokitClient(id: number) {
        let client = this.clients.get(id);

        if (!client) {
            throw new Error(`Client not found with Installation ID: ${id}`);
        }

        if (client.expiration < Date.now()) {
            client = await this.refreshOctokitClient(id);
        }

        return client.octokit;
    }

    private async handleOpenDiscussion({ payload }: { payload: object }) {
        const discussion = (payload as DiscussionCreatedEvent).discussion;

        const installation = getInstallation(payload);

        const body = `
        ## Summary

        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean magna nunc, condimentum a purus eu, congue fringilla libero. Aenean sagittis justo at egestas rutrum. Pellentesque non elit suscipit, auctor justo ac, mollis lorem. Maecenas tempor consectetur efficitur. In hac habitasse platea dictumst. Vestibulum imperdiet ultricies dolor, at consectetur dui faucibus nec. Fusce et suscipit ante, quis dapibus ligula. Sed faucibus nibh sit amet sem iaculis feugiat. Proin mollis quam eget velit suscipit, sit amet ultricies ligula imperdiet. Donec sed ante ac ligula rutrum interdum sit amet quis nibh. Sed et augue aliquet, blandit mi ut, congue tellus. Donec metus libero, suscipit quis finibus nec, convallis at nibh. Ut magna nunc, sagittis at dolor a, tincidunt commodo nulla. 

        ## Vote

        | Fetaure        | Description         | Vote                                  | Votes                                 |
        | ----------------- | ----------------------- | --------------------------------- |  --------------------------------- |
        | Create User | Add POST /user endpoint | [Click here](http://localhost:3000/sign-vote) |  #################### (20) |
        | Delete User | Add DELETE /user endpoint | [Click here](http://localhost:3000/sign-vote) |  ########################## (30) |
        `;

        await this.discussions.updateBody(installation.id, discussion.node_id, body);
    }

    private async handleOpenIssue({ payload }: { payload: object }) {
        const issue = (payload as IssuesOpenedEvent).issue;
        const repository = (payload as IssuesOpenedEvent).repository;

        const installation = getInstallation(payload);

        const owner = repository.owner.login;
        const repo = repository.name;

        const res = await this.repos.getLabels(installation.id, owner, repo);

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

        const issueLabels = [response.priority as string, response.type as string];

        this.issues.addLabels(installation.id, owner, repo, issue.number, issueLabels);
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

        return client;
    },

    stop: async (_runtime: IAgentRuntime) => {
        elizaLogger.info('GitHub Client stop');
    },
};

function getInstallation(payload: { installation?: InstallationLite }) {
    if (!payload.installation) {
        throw new Error('Missing repository GithubApp installation');
    }

    return payload.installation;
}
