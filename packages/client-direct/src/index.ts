import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DirectClient {
    private readonly router;

    constructor() {
        this.router = express.Router();

        this.router.use('/static', express.static(path.join(__dirname, '../public')));
    }

    public getRouter() {
        return this.router;
    }
}
