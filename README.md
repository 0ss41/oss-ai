# Oss-AI: Revolutionizing the Open Source Business Model

Oss-AI is transforming the way open-source projects are managed and monetized by leveraging AI and blockchain technologies. Our AI-powered agents assist developers in handling the operational challenges of maintaining open-source projects, allowing them to focus on what they love most\u2014coding.

## AI-Powered Project Management

Oss-AI automates key aspects of open-source project management, including:

- Issue Triage - Efficiently categorizing and prioritizing issues.
- Pull Request (PR) Reviews - Providing AI-assisted code reviews.
- Community Engagement - Managing discussions on Twitter, Discord, and Telegram.
- Feature Discovery - Identifying and suggesting impactful new features.
- Product Roadmapping - Helping define and refine project direction.

By eliminating tedious management tasks, Oss-AI empowers open-source developers to focus on innovation.

## Blockchain-Powered Governance & Rewards

Oss-AI integrates blockchain technology to enhance decision-making, transparency, and contributor incentives through:

- Decentralized Governance - Developers and contributors can vote on the product roadmap and key community decisions.
- Reputation-Based Contribution System - Contributors earn reputation points based on their engagement and impact.
- Fair Reward Distribution \u2013 Contributions are rewarded based on reputation, ensuring fair and transparent compensation.

## Sustainable Open Source Monetization

Oss-AI enables open-source developers to monetize their projects by offering them as commercial products. A portion of the revenue is redistributed to the community, ensuring that contributors are fairly compensated. Additionally, projects can operate without hiring full-time developers, as freelance contributors are rewarded based on their work and reputation.

With blockchain transparency, AI-driven efficiency, and fair rewards, Oss-AI is setting a new standard for open-source sustainability.

## Installation

```shell 
$ pnpm install
```

## Configuration

Copy and rename the `.env.example` to `.env` file. Set the required variables.

## Development

Install pre-commit hook:

```shell 
$ pnpm lefthook install
```


Install [ollama](https://ollama.com/) to run your model locally. Start the environment:

```shell 
$ docker compose up -d
```

To recive the Webhooks from Github use [smee.io](https://smee.io):

```shell 
$ pnpm smee --url [WEBHOOK_URL] --target http://127.0.0.1:3000/api/github/webhooks
```

Run the iAgent:

```shell 
$ pnpm turbo run dev
```

## Format & Lint

Run [Biome.js](https://biomejs.dev/):

```shell 
$ pnpm turbo run format
```

Fix linting and formatting errors: 

```shell 
$ pnpm turbo run format:fix
```