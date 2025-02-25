import type { GitHubClient } from '..';

export default class Client {
    constructor(protected readonly client: GitHubClient) {}
}
