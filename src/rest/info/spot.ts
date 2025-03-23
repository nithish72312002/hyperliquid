import { SpotMeta, SpotClearinghouseState, SpotMetaAndAssetCtxs } from '../../types';
import { HttpApi } from '../../utils/helpers';
import { InfoType } from '../../types/constants';
import { SymbolConversion } from '../../utils/symbolConversion';

export class SpotInfoAPI {
    private httpApi: HttpApi;
    private symbolConversion: SymbolConversion;

    constructor(httpApi: HttpApi, symbolConversion: SymbolConversion) {
        this.httpApi = httpApi;
        this.symbolConversion = symbolConversion;
    }

    async getSpotMeta(rawResponse: boolean = false): Promise<SpotMeta> {
        const response = await this.httpApi.makeRequest<SpotMeta>({ type: InfoType.SPOT_META });
        return rawResponse ? response : await this.symbolConversion.convertResponse(response, ["name", "coin", "symbol"], "SPOT");
    }

    async getSpotClearinghouseState(user: string, rawResponse: boolean = false): Promise<SpotClearinghouseState> {
        const response = await this.httpApi.makeRequest<SpotClearinghouseState>({ type: InfoType.SPOT_CLEARINGHOUSE_STATE, user: user });
        return rawResponse ? response : await this.symbolConversion.convertResponse(response, ["name", "coin", "symbol"], "SPOT");
    }

    async getSpotMetaAndAssetCtxs(rawResponse: boolean = false): Promise<SpotMetaAndAssetCtxs> {
        const response = await this.httpApi.makeRequest<SpotMetaAndAssetCtxs>({ type: InfoType.SPOT_META_AND_ASSET_CTXS });
        return rawResponse ? response : await this.symbolConversion.convertResponse(response);
    }

    async getTokenDetails(tokenId: string, rawResponse: boolean = false): Promise<any> {
        const response = await this.httpApi.makeRequest<any>({ 
            type: InfoType.TOKEN_DETAILS,
            tokenId: tokenId
        }, 20);
        
        return rawResponse ? response : await this.symbolConversion.convertResponse(response);
    }
    
    async getSpotDeployState(user: string, rawResponse: boolean = false): Promise<any> {
        const response = await this.httpApi.makeRequest<any>({ 
            type: InfoType.SPOT_DEPLOY_STATE,
            user: user
        }, 20);
        
        return rawResponse ? response : await this.symbolConversion.convertResponse(response);
    }

    /**
     * Returns a list of assets that can be transferred between HyperEVM and spot
     * Only assets with an EVM contract can be transferred
     * @param user The user address to check transferrable assets for
     * @param rawResponse Whether to return the raw response without symbol conversion
     * @returns Array of transferrable assets with coin name, token index, total balance, hold amount, and withdrawable amount
     */
    async getTransferrableAssets(user: string, rawResponse: boolean = false): Promise<Array<{
        coin: string;
        token: number;
        total: string;
        hold: string;
        withdrawable: string;
    }>> {
        // Get both the clearinghouse state and meta data
        const [clearinghouseState, meta] = await Promise.all([
            this.getSpotClearinghouseState(user, true),
            this.getSpotMeta(true)
        ]);

        // Create a mapping of token index to whether it has an EVM contract
        const tokenEvmMapping = new Map<number, boolean>();
        
        // Access the tokens array and check for evmContract property
        // We need to use type assertion here since the type definition doesn't include evmContract
        meta.tokens.forEach((token: any) => {
            // A token is transferrable if it has an evmContract property that's not null
            tokenEvmMapping.set(token.index, !!token.evmContract);
        });

        // Filter balances to only include those with EVM contracts
        // We need to use type assertion here since the type definition doesn't include token field
        const transferrableAssets = (clearinghouseState.balances as any[])
            .filter(balance => {
                // Only include tokens that have an EVM contract
                return tokenEvmMapping.get(balance.token);
            })
            .map(balance => ({
                coin: balance.coin,
                token: balance.token,
                total: balance.total,
                hold: balance.hold,
                withdrawable: (parseFloat(balance.total) - parseFloat(balance.hold)).toString()
            }));

        // Apply symbol conversion if needed
        return rawResponse ? transferrableAssets : await this.symbolConversion.convertResponse(transferrableAssets, ["name", "coin", "symbol"], "SPOT");
    }
}
