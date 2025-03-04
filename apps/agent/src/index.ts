import {
    AgentRuntime,
    CacheManager,
    type Character,
    DbCacheAdapter,
    type ICacheManager,
    type IDatabaseAdapter,
    elizaLogger,
} from '@elizaos/core';
import { PostgresDatabaseAdapter as Postgres } from '@repo/adapter-postgres';
import { DirectClient } from '@repo/client-direct';
import { GitHubClientInteface } from '@repo/client-github';
import cors from 'cors';
import express from 'express';
import { ProductManager } from './characters/ProductManager';
import { type AgentSettings, loadSettings } from './settings';

const createAgent = async (
    character: Character,
    db: IDatabaseAdapter,
    cache: ICacheManager,
): Promise<AgentRuntime> => {
    elizaLogger.log(`Creating runtime for character ${character.name}`);

    return new AgentRuntime({
        databaseAdapter: db,
        token: '',
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        plugins: [],
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager: cache,
    });
};

const initializeDatabase = async (
    url: string,
    character: Character,
): Promise<[Postgres, CacheManager]> => {
    elizaLogger.info('Initializing PostgreSQL connection...');

    const db = new Postgres({
        connectionString: url,
    });

    await db
        .init()
        .then(() => {
            elizaLogger.success('Successfully connected to PostgreSQL database');
        })
        .catch((error) => {
            elizaLogger.error('Failed to connect to PostgreSQL:', error);
        });

    elizaLogger.info('Using Database Cache...');

    if (!character?.id) {
        throw new Error('Postgres Cache requires id to be set in character definition');
    }

    const cache = new CacheManager(new DbCacheAdapter(db, character.id));

    return [db, cache];
};

const startRuntime = async (db: Postgres, cache: CacheManager, character: Character) => {
    const runtime: AgentRuntime = await createAgent(character, db, cache);

    await runtime.initialize();

    return runtime;
};

const startAgent = async (settings: AgentSettings, character: Character) => {
    const [db, cache] = await initializeDatabase(settings.POSTGRES_URL, character);

    return startRuntime(db, cache, character).catch((error) => {
        db.close();
        throw error;
    });
};

const startAgents = async () => {
    const settings = await loadSettings();

    const runtime = await startAgent(settings, ProductManager).catch((error) => {
        elizaLogger.error(`Error starting Character ${ProductManager.name}:`, error);
        throw error;
    });

    elizaLogger.info(`Started ${ProductManager.name} as ${runtime.agentId}`);

    const githubClient = await GitHubClientInteface.start(runtime);
    const directClient = new DirectClient();

    const app = express();

    app.use(cors());

    //@ts-ignore
    app.use(githubClient.createMiddleware());

    app.use(directClient.getRouter());

    app.listen(3000, () => {
        elizaLogger.info('Github Client up & running');
    });

    elizaLogger.info('iAgent up & running');
};

startAgents().catch((err) => {
    elizaLogger.error(err);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
    console.error('unhandledRejection', err);
});
