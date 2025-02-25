// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import { nodePolyfills } from '@bangjelkoski/vite-plugin-node-polyfills';

// https://astro.build/config
export default defineConfig({
    vite: {
        plugins: [tailwindcss(), nodePolyfills({ protocolImports: true })],
    },
});
