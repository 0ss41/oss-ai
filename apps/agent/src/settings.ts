import { elizaLogger, settings } from '@elizaos/core';
import { z } from 'zod';

export const settingsSchema = z.object({
    POSTGRES_URL: z.string().min(1, 'Postgres URL is required'),
});

export type AgentSettings = z.infer<typeof settingsSchema>;

export async function loadSettings(): Promise<AgentSettings> {
    const config = {
        POSTGRES_URL: settings.POSTGRES_URL,
    };

    return settingsSchema.parseAsync(config).catch(handleError);
}

const handleError = (error: Error) => {
    if (error instanceof z.ZodError) {
        const errorMessages = error.errors
            .map((err) => `-> ${err.path.join('.')}: ${err.message}`)
            .join('\n');

        const message = `Settings validation failed:\n${errorMessages}`;

        elizaLogger.error(message);

        throw new Error(message);
    }

    elizaLogger.error(`Failed to load Settings: ${error}`);

    throw error;
};
