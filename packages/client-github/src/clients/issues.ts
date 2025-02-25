import Client from './client';

export default class IssuesClient extends Client {
    public async addLabels(
        installationId: number,
        owner: string,
        repo: string,
        issueNumber: number,
        labels: string[],
    ) {
        const octokit = await this.client.getOctokitClient(installationId);

        return await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
            owner,
            repo,
            issue_number: issueNumber,
            labels,
        });
    }
}
