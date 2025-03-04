import fs from 'node:fs';
import {
    type Client,
    type Content,
    type IAgentRuntime,
    ModelClass,
    composeContext,
    elizaLogger,
    generateMessageResponse,
    stringToUuid,
} from '@elizaos/core';
import { Network } from '@injectivelabs/networks';
import { MsgBroadcasterWithPk, MsgInstantiateContract, PrivateKey } from '@injectivelabs/sdk-ts';
import { App } from '@octokit/app';
import type { Octokit } from '@octokit/core';
import { createNodeMiddleware } from '@octokit/webhooks';
import type {
    DiscussionCreatedEvent,
    InstallationLite,
    IssuesOpenedEvent,
} from '@octokit/webhooks-types';
import dedent from 'dedent';
import { DiscussionsClient, IssuesClient, ReposClient } from './clients';
import { type AppSettings, loadSettings } from './settings';
import { discussionClosedTemplate } from './templates/discussion-closed';
import { issueOpenedTemplate } from './templates/issue-opened';

const network: Network = Network.Testnet;

export class GitHubClient {
    private readonly app: App;

    private readonly clients: Map<number, { octokit: Octokit; expiration: number }>;

    private readonly codeId: number;

    private readonly privateKey: PrivateKey;

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
        this.app.webhooks.on('discussion.closed', this.handleClosedDiscussion.bind(this));

        this.app.webhooks.onError((error) => {
            elizaLogger.error('Error processing the Github Webhook:', error);
        });

        this.codeId = Number(settings.CODE_ID);

        this.privateKey = PrivateKey.fromMnemonic(settings.MNEMONIC);
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

    private async handleClosedDiscussion({ payload }: { payload: object }) {
        const discussion = (payload as DiscussionCreatedEvent).discussion;
        const repository = (payload as DiscussionCreatedEvent).repository;

        const installation = getInstallation(payload);

        const owner = repository.owner.login;
        const repo = repository.name;

        const comments = await this.discussions.getComments(
            installation.id,
            owner,
            repo,
            discussion.number,
        );

        const roomId = stringToUuid(`github-discussion-${discussion.id}-room`);
        const userId = stringToUuid(discussion.user.id);

        this.agent.ensureConnection(
            userId,
            roomId,
            discussion.user.name,
            discussion.user.name,
            'github',
        );

        const discussionContent = `${discussion.title}\n${discussion.body}\n${comments.map((comment) => comment.body).join('\n')}`;

        const content: Content = {
            text: discussionContent,
            source: 'github',
            url: discussion.html_url,
            inReplyTo: undefined,
        };

        const userMessage = {
            content,
            userId,
            roomId,
            agentId: this.agent.agentId,
        };

        const state = await this.agent.composeState(userMessage, {
            agentName: this.agent.character.name,
            title: discussion.title,
            body: discussion.body,
            comments: comments.map((comment) => comment.body).join('\n'),
        });

        const context = composeContext({
            state,
            template: discussionClosedTemplate,
        });

        const response = await generateMessageResponse({
            runtime: this.agent,
            context,
            modelClass: ModelClass.LARGE,
        });

        const features = response.features as { name: string; description: string }[];

        const msg = MsgInstantiateContract.fromJSON({
            sender: this.privateKey.toBech32(),
            admin: '',
            codeId: this.codeId,
            msg: {
                candidates: features.map((feature) => feature.name),
                deadline: Date.now() + 1000 * 60 * 60 * 24,
            },
            label: 'VoteContract',
            amount: {
                denom: 'inj',
                amount: '1000',
            },
        });

        const msgBroadcastClient = new MsgBroadcasterWithPk({
            privateKey: this.privateKey,
            network: network,
        });

        const res = await msgBroadcastClient.broadcast({
            msgs: msg,
        });

        const created_event = res.events?.filter(
            (event) => event.type === 'cosmwasm.wasm.v1.EventContractInstantiated',
        )[0];
        const created_attribute = created_event.attributes.filter(
            (attribute: { key: string }) => attribute.key === 'contract_address',
        )[0];

        const contract_address = created_attribute.value as string;

        try {
            const body = dedent`
            ## Summary

            ${response.summary}

            ## Vote

            | Fetaure                      | Description                         | Vote                                          | Votes  |
            | ---------------------------- | ----------------------------------- | --------------------------------------------- | ------ |
            | ${features[0].name} | ${features[0].description} | [Click here](http://localhost:4321/sign-vote?address=${contract_address.replace(/['"]+/g, '')}&candidate=${encodeURIComponent(features[0].name.trim())}) |  # (0) |
            | ${features[1].name} | ${features[1].description} | [Click here](http://localhost:4321/sign-vote?address=${contract_address.replace(/['"]+/g, '')}&candidate=${encodeURIComponent(features[1].name.trim())}) |  # (0) |
            | ${features[2].name} | ${features[2].description} | [Click here](http://localhost:4321/sign-vote?address=${contract_address.replace(/['"]+/g, '')}&candidate=${encodeURIComponent(features[2].name.trim())}) |  # (0) |
            | ${features[3].name} | ${features[3].description} | [Click here](http://localhost:4321/sign-vote?address=${contract_address.replace(/['"]+/g, '')}&candidate=${encodeURIComponent(features[3].name.trim())}) |  # (0) |
            | ${features[4].name} | ${features[4].description} | [Click here](http://localhost:4321/sign-vote?address=${contract_address.replace(/['"]+/g, '')}&candidate=${encodeURIComponent(features[4].name.trim())}) |  # (0) |
            `;

            await this.discussions.create(
                installation.id,
                repository.node_id,
                discussion.category.node_id,
                'Time to Vote!',
                body,
            );
        } catch (err) {
            elizaLogger.error('Failed to generate voting discussion:', err);
        }
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

        // TODO: Repository Code as Context
        // TODO: Closed Issues as examples

        const state = await this.agent.composeState(userMessage, {
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
