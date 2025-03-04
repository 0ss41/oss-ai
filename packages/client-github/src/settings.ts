import { type IAgentRuntime, elizaLogger } from '@elizaos/core';
import { z } from 'zod';

export const settingsSchema = z.object({
    GITHUB_APP_ID: z.string().min(1, 'Github App ID is required'),
    GITHUB_APP_KEY: z.string().min(1, 'Github Secret Key is required'),
    GITHUB_WEBHOOK_SECRET: z.string().min(1, 'Github Webhook Secret is required'),
    MNEMONIC: z.string().min(1, 'Mnemonic is required'),
    CODE_ID: z.string().min(1, 'Smart Contract Code ID is required'),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export async function loadSettings(runtime: IAgentRuntime): Promise<AppSettings> {
    const config = {
        GITHUB_APP_ID: runtime.getSetting('GITHUB_APP_ID'),
        GITHUB_APP_KEY: runtime.getSetting('GITHUB_APP_KEY'),
        GITHUB_WEBHOOK_SECRET: runtime.getSetting('GITHUB_WEBHOOK_SECRET'),
        MNEMONIC: runtime.getSetting('MNEMONIC'),
        CODE_ID: runtime.getSetting('CODE_ID'),
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
