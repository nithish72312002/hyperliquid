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
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 5;
  private baseRetryDelayMs: number = 1000;

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
      this.refreshAssetMaps().catch(error => {
        console.error('Failed to refresh asset maps:', error);
        // Increment consecutive failures counter
        this.consecutiveFailures++;

        // If we've reached the maximum number of consecutive failures, stop refreshing
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          console.warn(
            `Maximum consecutive failures (${this.maxConsecutiveFailures}) reached. Stopping automatic refresh.`
          );
          this.stopPeriodicRefresh();
        }
      });
    }, this.refreshIntervalMs);
  }

  // Check if max failures has been reached and stop refresh if needed
  private checkMaxFailures(): void {
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      console.warn(
        `Maximum consecutive failures (${this.maxConsecutiveFailures}) reached. Stopping automatic refresh.`
      );
      this.stopPeriodicRefresh();
    }
  }

  public stopPeriodicRefresh(): void {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async refreshAssetMaps(): Promise<void> {
    try {
      const [perpMeta, spotMeta] = await Promise.all([
        this.httpApi.makeRequest<MetaAndAssetCtxs>({
          type: CONSTANTS.InfoType.PERPS_META_AND_ASSET_CTXS,
        }),
        this.httpApi.makeRequest<SpotMetaAndAssetCtxs>({
          type: CONSTANTS.InfoType.SPOT_META_AND_ASSET_CTXS,
        }),
      ]);

      // Verify responses are valid before proceeding
      if (
        !perpMeta ||
        !perpMeta[0] ||
        !perpMeta[0].universe ||
        !Array.isArray(perpMeta[0].universe)
      ) {
        throw new Error('Invalid perpetual metadata response');
      }

      if (
        !spotMeta ||
        !spotMeta[0] ||
        !spotMeta[0].tokens ||
        !Array.isArray(spotMeta[0].tokens) ||
        !spotMeta[0].universe ||
        !Array.isArray(spotMeta[0].universe)
      ) {
        throw new Error('Invalid spot metadata response');
      }

      this.assetToIndexMap.clear();
      this.exchangeToInternalNameMap.clear();
      this.spotTokensSet.clear(); // Clear spot tokens set

      // Handle perpetual assets
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

          // Store the market index
          const marketIndex = 10000 + market.index;

          // Map using the base-quote format
          this.assetToIndexMap.set(baseQuoteFormat, marketIndex);
          this.exchangeToInternalNameMap.set(market.name, baseQuoteFormat);
        }
      });

      // Reset consecutive failures counter on success
      this.consecutiveFailures = 0;
    } catch (error) {
      // Increment consecutive failures counter
      this.consecutiveFailures++;

      // Check if we've reached the maximum number of consecutive failures
      this.checkMaxFailures();

      // Propagate the error to be handled by the caller
      throw error;
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

  public async getAllAssets(): Promise<{ perp: string[]; spot: string[] }> {
    await this.ensureInitialized();
    const perp: string[] = [];
    const spot: string[] = [];

    for (const [asset, index] of this.assetToIndexMap.entries()) {
      if (asset.endsWith('-PERP')) {
        perp.push(asset);
      } else if (index >= 10000) {
        // Spot assets have indices >= 10000
        spot.push(asset);
      }
    }

    return { perp, spot };
  }

  async convertSymbol(symbol: string, mode: string = '', symbolMode: string = ''): Promise<string> {
    await this.ensureInitialized();
    let rSymbol: string;
    if (mode === 'reverse') {
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
    if (symbolMode === 'PERP') {
      // In PERP mode, add -PERP to symbols that don't already have it
      if (!rSymbol.endsWith('-PERP')) {
        rSymbol = symbol + '-PERP';
      }
    } else if (symbolMode === 'SPOT') {
      // In SPOT mode, ensure we don't add -PERP to spot tokens
      if (this.spotTokensSet.has(symbol)) {
        // If it's a known spot token, use the original name
        rSymbol = symbol;
      }
    }

    return rSymbol;
  }

  async convertSymbolsInObject(
    obj: any,
    symbolsFields: Array<string> = ['coin', 'symbol'],
    symbolMode: string = ''
  ): Promise<any> {
    await this.ensureInitialized();
    if (typeof obj !== 'object' || obj === null) {
      return this.convertToNumber(obj);
    }

    if (Array.isArray(obj)) {
      return Promise.all(
        obj.map(item => this.convertSymbolsInObject(item, symbolsFields, symbolMode))
      );
    }

    const convertedObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (symbolsFields.includes(key)) {
        convertedObj[key] = await this.convertSymbol(value as string, '', symbolMode);
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
    symbolsFields: string[] = ['coin', 'symbol'],
    symbolMode: string = ''
  ): Promise<any> {
    return this.convertSymbolsInObject(response, symbolsFields, symbolMode);
  }

  /**
   * Process WebData2 response with targeted symbol conversion for better performance
   * @param data The WebData2 API response
   * @returns Processed data with converted symbols
   */
  async processWebData2(data: any): Promise<any> {
    await this.ensureInitialized();

    if (!data) return data;

    // Create a deep copy to avoid modifying the original
    const result = JSON.parse(JSON.stringify(data));

    // Process only the specific sections of the data that need conversion
    // instead of doing a full recursive traversal which can cause performance issues

    // Process meta.universe (PERP assets)
    if (result.meta?.universe) {
      // Using console.log since there's no this.log method in the class
      console.log(`Processing ${result.meta.universe.length} perp assets in WebData2...`);
      result.meta.universe = await Promise.all(
        result.meta.universe.map(async (asset: any) => {
          asset.name = `${asset.name}-PERP`;
          return asset;
        })
      );
    }

    // Process spotAssetCtxs (spot assets)
    if (result.spotAssetCtxs) {
      console.log(`Processing ${result.spotAssetCtxs.length} spot assets in WebData2...`);
      for (const ctx of result.spotAssetCtxs) {
        if (ctx.coin) {
          ctx.id = ctx.coin;
          // We'll use convertSymbol with SPOT mode instead of getSpotTokenName
          ctx.coin = await this.convertSymbol(ctx.coin, '', 'SPOT');
        }
      }
    }

    // Process openOrders (critical for trading)
    if (result.openOrders && Array.isArray(result.openOrders)) {
      console.log(`Processing ${result.openOrders.length} open orders in WebData2...`);
      result.openOrders = await Promise.all(
        result.openOrders.map(async (order: any) => {
          if (order.coin) {
            order.coin = await this.convertSymbol(order.coin);
          }
          return order;
        })
      );
    }

    // Process twapStates (critical for TWAP orders)
    if (result.twapStates && Array.isArray(result.twapStates)) {
      console.log(`Processing ${result.twapStates.length} TWAP states in WebData2...`);
      result.twapStates = await Promise.all(
        result.twapStates.map(async (twapState: any) => {
          // TWAP states are arrays with the second element containing the order info
          if (
            Array.isArray(twapState) &&
            twapState.length > 1 &&
            twapState[1] &&
            twapState[1].coin
          ) {
            twapState[1].coin = await this.convertSymbol(twapState[1].coin);
          }
          return twapState;
        })
      );
    }

    // Process positions (critical for trading)
    if (result.clearinghouseState?.assetPositions) {
      console.log(`Processing positions in WebData2...`);
      result.clearinghouseState.assetPositions = await Promise.all(
        result.clearinghouseState.assetPositions.map(async (pos: any) => {
          if (pos.position?.coin) {
            pos.position.coin = await this.convertSymbol(pos.position.coin);
          }
          return pos;
        })
      );
    }

    return result;
  }
}
