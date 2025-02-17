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
import { GitHubClientInteface } from '@repo/client-github';
import { ProductManager } from './characters/ProductManager';
import { type AgentSettings, loadSettings } from './settings';

const createAgent = async (
    character: Character,
    db: IDatabaseAdapter,
    cache: ICacheManager,
    token: string,
): Promise<AgentRuntime> => {
    elizaLogger.log(`Creating runtime for character ${character.name}`);

    return new AgentRuntime({
        databaseAdapter: db,
        token,
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

const startRuntime = async (
    db: Postgres,
    cache: CacheManager,
    token: string,
    character: Character,
) => {
    const runtime: AgentRuntime = await createAgent(character, db, cache, token);

    await runtime.initialize();

    return runtime;
};

const startAgent = async (settings: AgentSettings, character: Character) => {
    const [db, cache] = await initializeDatabase(settings.POSTGRES_URL, character);

    return startRuntime(db, cache, settings.OPENAI_TOKEN, character).catch((error) => {
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

    GitHubClientInteface.start(runtime);

    elizaLogger.info('iAgent up & running');
};

startAgents().catch(() => process.exit(1));

process.on('uncaughtException', (err) => {
    console.error('uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
    console.error('unhandledRejection', err);
});
