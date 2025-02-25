import Client from './client';

export default class DiscussionsClient extends Client {
    public async updateBody(installationId: number, discussionId: string, body: string) {
        const octokit = await this.client.getOctokitClient(installationId);

        return octokit.graphql(
            `
                mutation {
                    updateDiscussion(input: {discussionId: "${discussionId}", body: "${body}"}) {
                        discussion {
                            id
                        }
                    }
                }
            `,
        );
    }
}
