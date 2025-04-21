import { InfoAPI } from './rest/info';
import { ExchangeAPI } from './rest/exchange';
import { WebSocketClient } from './websocket/connection';
import { WebSocketSubscriptions } from './websocket/subscriptions';
import { RateLimiter } from './utils/rateLimiter';
import * as CONSTANTS from './types/constants';
import { CustomOperations } from './rest/custom';
import { SymbolConversion } from './utils/symbolConversion';
import { AuthenticationError } from './utils/errors';
import { environment } from './utils/environment';

export interface HyperliquidConfig {
    enableWs?: boolean;
    account?: any;
    testnet?: boolean;
    walletAddress?: string;
    vaultAddress?: string;
    maxReconnectAttempts?: number;
}

export class Hyperliquid {
    public info: InfoAPI;
    public exchange: ExchangeAPI = {} as ExchangeAPI;
    public ws: WebSocketClient;
    public subscriptions: WebSocketSubscriptions;
    public custom: CustomOperations;
    public symbolConversion: SymbolConversion;

    private rateLimiter: RateLimiter;
    private isValidAccount: boolean = false;
    private walletAddress: string | null = null;
    private _initialized: boolean = false;
    private _initializing: Promise<void> | null = null;
    private _account?: any;
    private _walletAddress?: string;
    private vaultAddress?: string | null = null;
    private enableWs: boolean;
    private baseUrl: string;
    private testnet: boolean;

    constructor(params: HyperliquidConfig = {}) {
        const { enableWs = true, account, testnet = false, walletAddress, vaultAddress, maxReconnectAttempts } = params;
        
        // Browser-specific security warnings
        if (environment.isBrowser) {
            if (!window.isSecureContext) {
                console.warn('Warning: Running in an insecure context. Some features may be limited.');
            }
        }

        this.testnet = testnet;
        this.baseUrl = testnet ? CONSTANTS.BASE_URLS.TESTNET : CONSTANTS.BASE_URLS.PRODUCTION;
        this.enableWs = enableWs;
        this.rateLimiter = new RateLimiter();
        this.symbolConversion = new SymbolConversion(this.baseUrl, this.rateLimiter);
        this.walletAddress = walletAddress || null;
        this.vaultAddress = vaultAddress || null;
        this._account = account; // Store the account
        
        // Initialize REST API clients
        this.info = new InfoAPI(this.baseUrl, this.rateLimiter, this.symbolConversion, this);
        
        // Initialize custom operations
        this.custom = new CustomOperations(this);
        
        // Initialize WebSocket client if enabled
        if (enableWs) {
            if (!environment.hasNativeWebSocket() && environment.isNode) {
                console.warn('Native WebSocket support is not available in this Node.js version. Attempting to use ws package...');
            }
            
            // Create WebSocket client - it will attempt to use ws package if native WebSocket is not available
            this.ws = new WebSocketClient(testnet, maxReconnectAttempts);
            this.subscriptions = new WebSocketSubscriptions(this.ws, this.symbolConversion);
            
            // Only disable WebSocket if the client fails to initialize
            if (!environment.supportsWebSocket()) {
                console.warn('WebSocket support is not available. Please install the ws package to enable WebSocket features:\n\nnpm install ws\n');
                this.enableWs = false;
            }
        } else {
            // Initialize with dummy objects if WebSocket is disabled
            this.ws = {} as WebSocketClient;
            this.subscriptions = {} as WebSocketSubscriptions;
        }
        
        // Set up authentication if account is provided
        if (account) {
            this.initializeWithAccount(account, testnet);
        }
    }

    async connect(): Promise<void> {
        await this.ensureInitialized();
        if (this.enableWs && this.ws.connect) {
            try {
                await this.ws.connect();
            } catch (error) {
                console.error('Failed to connect WebSocket:', error);
            }
        }
    }

    async initialize(): Promise<void> {
        if (this._initialized) {
            return;
        }
        
        if (this._initializing) {
            return this._initializing;
        }
        
        this._initializing = (async () => {
            try {
                await this.symbolConversion.initialize();
                
                if (this._account) {
                    this.initializeWithAccount(this._account, this.testnet);
                }
                
                if (this.enableWs) {
                    await this.connect();
                }
                
                this._initialized = true;
            } catch (error) {
                console.error('Failed to initialize client:', error);
                throw error;
            } finally {
                this._initializing = null;
            }
        })();
        
        return this._initializing;
    }

    async ensureInitialized(): Promise<void> {
        if (!this._initialized) await this.initialize();
    }

    private createAuthenticatedProxy<T extends object>(Class: new (...args: any[]) => T): T {
        return new Proxy({} as T, {
            get: (target, prop) => {
                if (!this.isValidAccount) {
                    throw new AuthenticationError('Invalid or missing account. This method requires authentication.');
                }
                return target[prop as keyof T];
            }
        });
    }

    private initializeWithAccount(account: any, testnet: boolean): void {
        try {
            // Ensure account has the necessary methods
            if (!account || typeof account.signTypedData !== 'function') {
                throw new Error('Invalid account. Account must have a signTypedData method.');
            }
            
            // Create exchange API with account
            this.exchange = new ExchangeAPI(
                testnet, 
                this.info, 
                this.rateLimiter, 
                this.symbolConversion, 
                account,
                this.walletAddress,
                this,
                this.vaultAddress
            );
            
            // Create custom operations with account
            this.custom = new CustomOperations(
                this.exchange, 
                this.info, 
                this.symbolConversion, 
                this.walletAddress,
                account 
            );
            
            this.isValidAccount = true; // Account is valid for authentication
        } catch (error) {
            console.warn("Invalid account provided. Some functionalities will be limited.");
            this.isValidAccount = false;
        }
    }

    // Modify existing methods to check initialization
    public isAuthenticated(): boolean {
        this.ensureInitialized();
        return this.isValidAccount;
    }

    public isWebSocketConnected(): boolean {
        return this.ws?.isConnected() ?? false;
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
        }
    }

    public getBaseUrl(): string {
        return this.baseUrl;
    }

    public getRateLimiter(): RateLimiter {
        return this.rateLimiter;
    }
}

export * from './types';
export * from './utils/signing';
