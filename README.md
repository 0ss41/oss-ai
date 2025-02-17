# OSS-AI

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