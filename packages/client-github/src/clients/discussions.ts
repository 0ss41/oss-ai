import Client from './client';

type CommentsResponse = {
    repository: {
        discussion: {
            comments: {
                nodes: { body: string }[];
                pageInfo: { hasNextPage: boolean; endCursor: string };
            };
        };
    };
};

export default class DiscussionsClient extends Client {
    public async create(
        installationId: number,
        repositoryId: string,
        categoryId: string,
        title: string,
        body: string,
    ) {
        const octokit = await this.client.getOctokitClient(installationId);

        return octokit.graphql(
            `
                mutation {
                    createDiscussion(input: {repositoryId: "${repositoryId}", categoryId: "${categoryId}", body: "${body}", title: "${title}"}) {
                        discussion {
                            id
                        }
                    }
                }

            `,
        );
    }

    public async getComments(
        installationId: number,
        owner: string,
        repo: string,
        discussionId: number,
    ): Promise<{ body: string }[]> {
        const octokit = await this.client.getOctokitClient(installationId);

        // TODO: Get all Comments

        const res = await octokit.graphql<CommentsResponse>(
            `
                query {
                    repository(owner: "${owner}", name: "${repo}") {
                        discussion(number: ${discussionId}) {
                            comments(first: 50) {
                                nodes {
                                    body
                                }
                            }
                        }
                    }
                }
            `,
        );

        return res.repository.discussion.comments.nodes;
    }
}
