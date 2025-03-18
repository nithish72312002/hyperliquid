import { HttpApi } from './helpers';
import * as CONSTANTS from '../types/constants';
import { MetaAndAssetCtxs, SpotMetaAndAssetCtxs } from '../types';

export class SymbolConversion {
    private assetToIndexMap: Map<string, number> = new Map();
    private exchangeToInternalNameMap: Map<string, string> = new Map();
    private spotTokensSet: Set<string> = new Set(); // Track spot tokens specifically
    private httpApi: HttpApi;
    private refreshIntervalMs: number = 60000;
    private refreshInterval: any = null;
    private initialized: boolean = false;

    constructor(baseURL: string, rateLimiter: any) {
        this.httpApi = new HttpApi(baseURL, CONSTANTS.ENDPOINTS.INFO, rateLimiter);
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        try {
            await this.refreshAssetMaps();
            this.startPeriodicRefresh();
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize SymbolConversion:', error);
            throw error;
        }
    }

    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error('SymbolConversion must be initialized before use. Call initialize() first.');
        }
    }

    async getInternalName(exchangeName: string): Promise<string | undefined> {
        this.ensureInitialized();
        return this.exchangeToInternalNameMap.get(exchangeName);
    }

    private startPeriodicRefresh(): void {
        if (this.refreshInterval !== null) {
            clearInterval(this.refreshInterval);
        }
        
        // Use standard setInterval that works in both Node.js and browser
        this.refreshInterval = setInterval(() => {
            this.refreshAssetMaps().catch(console.error);
        }, this.refreshIntervalMs);
    }

    private async refreshAssetMaps(): Promise<void> {
        try {
            const [perpMeta, spotMeta] = await Promise.all([
                this.httpApi.makeRequest<MetaAndAssetCtxs>({ "type": CONSTANTS.InfoType.PERPS_META_AND_ASSET_CTXS }),
                this.httpApi.makeRequest<SpotMetaAndAssetCtxs>({ "type": CONSTANTS.InfoType.SPOT_META_AND_ASSET_CTXS })
            ]);

            this.assetToIndexMap.clear();
            this.exchangeToInternalNameMap.clear();
            this.spotTokensSet.clear(); // Clear spot tokens set
            
            // Handle perpetual assets (unchanged)
            perpMeta[0].universe.forEach((asset: { name: string }, index: number) => {
                const internalName = `${asset.name}-PERP`;
                this.assetToIndexMap.set(internalName, index);
                this.exchangeToInternalNameMap.set(asset.name, internalName);
            });

            // Track all spot tokens
            if (spotMeta[0].tokens && Array.isArray(spotMeta[0].tokens)) {
                spotMeta[0].tokens.forEach((token: any) => {
                    if (token.name) {
                        this.spotTokensSet.add(token.name);
                    }
                });
            }

            // Handle spot assets with base-quote format
            spotMeta[0].universe.forEach((market: any) => {
                const baseToken = spotMeta[0].tokens.find((t: any) => t.index === market.tokens[0]);
                const quoteToken = spotMeta[0].tokens.find((t: any) => t.index === market.tokens[1]);
                
                if (baseToken && quoteToken) {
                    // New format: BASE-QUOTE (e.g., "PURR-USDC")
                    const baseQuoteFormat = `${baseToken.name}-${quoteToken.name}`;
                    
                    // Store the market index (same indexing as before)
                    const marketIndex = 10000 + market.index;
                    
                    // Map using the base-quote format
                    this.assetToIndexMap.set(baseQuoteFormat, marketIndex);
                    this.exchangeToInternalNameMap.set(market.name, baseQuoteFormat);
                }
            });
        } catch (error) {
            console.error('Failed to refresh asset maps:', error);
        }
    }

    public async getExchangeName(internalName: string): Promise<string | undefined> {
        await this.ensureInitialized();
        
        for (const [exchangeName, name] of this.exchangeToInternalNameMap.entries()) {
            if (name === internalName) {
                return exchangeName;
            }
        }
        
        return undefined;
    }

    public async getAssetIndex(assetSymbol: string): Promise<number | undefined> {
        await this.ensureInitialized();
        return this.assetToIndexMap.get(assetSymbol);
    }

    public async getAllAssets(): Promise<{ perp: string[], spot: string[] }> {
        await this.ensureInitialized();
        const perp: string[] = [];
        const spot: string[] = [];

        for (const [asset, index] of this.assetToIndexMap.entries()) {
            if (asset.endsWith('-PERP')) {
                perp.push(asset);
            } else if (index >= 10000) { // Spot assets have indices >= 10000
                spot.push(asset);
            }
        }

        return { perp, spot };
    }

    async convertSymbol(symbol: string, mode: string = "", symbolMode: string = ""): Promise<string> {
        await this.ensureInitialized();
        let rSymbol: string;
        if (mode === "reverse") {
            for (const [key, value] of this.exchangeToInternalNameMap.entries()) {
                if (value === symbol) {
                    return key;
                }
            }
            rSymbol = symbol;
        } else {
            rSymbol = this.exchangeToInternalNameMap.get(symbol) || symbol;
        }

        // Special handling for tokens that exist in both PERP and SPOT
        if (symbolMode === "PERP") {
            // In PERP mode, add -PERP to symbols that don't already have it
            if (!rSymbol.endsWith("-PERP")) {
                rSymbol = symbol + "-PERP";
            }
        } else if (symbolMode === "SPOT") {
            // In SPOT mode, ensure we don't add -PERP to spot tokens
            if (this.spotTokensSet.has(symbol)) {
                // If it's a known spot token, use the original name
                rSymbol = symbol;
            }
        }
        
        return rSymbol;
    }

    async convertSymbolsInObject(obj: any, symbolsFields: Array<string> = ["coin", "symbol"], symbolMode: string = ""): Promise<any> {
        await this.ensureInitialized();
        if (typeof obj !== 'object' || obj === null) {
            return this.convertToNumber(obj);   
        }
    
        if (Array.isArray(obj)) {
            return Promise.all(obj.map(item => this.convertSymbolsInObject(item, symbolsFields, symbolMode)));
        }
    
        const convertedObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (symbolsFields.includes(key)) {
                convertedObj[key] = await this.convertSymbol(value as string, "", symbolMode);
            } else if (key === 'side') {
                convertedObj[key] = value === 'A' ? 'sell' : value === 'B' ? 'buy' : value;
            } else {
                convertedObj[key] = await this.convertSymbolsInObject(value, symbolsFields, symbolMode);
            }
        }
        return convertedObj;
    }

    convertToNumber(value: any): any {
        if (typeof value === 'string') {
            if (/^-?\d+$/.test(value)) {
                return parseInt(value, 10);
            } else if (/^-?\d*\.\d+$/.test(value)) {
                return parseFloat(value);
            }
        }
        return value;
    }

    async convertResponse(
        response: any,
        symbolsFields: string[] = ["coin", "symbol"],
        symbolMode: string = ""
    ): Promise<any> {
        return this.convertSymbolsInObject(response, symbolsFields, symbolMode);
    }
}