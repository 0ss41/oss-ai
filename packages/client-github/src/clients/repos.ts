import Client from './client';

export default class ReposClient extends Client {
    public async getLabels(installationId: number, owner: string, repo: string) {
        const octokit = await this.client.getOctokitClient(installationId);

        return octokit.request('GET /repos/{owner}/{repo}/labels', {
            owner,
            repo,
        });
    }
}
