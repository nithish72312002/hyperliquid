// src/rest/custom.ts

import { ethers } from 'ethers';
import { InfoAPI } from './info';
import { ExchangeAPI } from './exchange';
import { UserOpenOrders } from '../types';
import { OrderResponse, CancelOrderRequest, OrderRequest, OrderType } from '../types/index';
import { CancelOrderResponse } from '../utils/signing'
import { SymbolConversion } from '../utils/symbolConversion';
import { floatToWire } from '../utils/signing';
import { Hyperliquid } from '../index';

export class CustomOperations {
    private exchange: ExchangeAPI;
    private infoApi: InfoAPI;
    private wallet?: ethers.Wallet;
    private account?: any;
    private symbolConversion: SymbolConversion;
    private walletAddress: string | null;
    private parent?: Hyperliquid;

    constructor(exchangeOrParent: ExchangeAPI | Hyperliquid, infoApiOrPrivateKey?: InfoAPI | string, privateKeyOrSymbolConversion?: string | SymbolConversion, symbolConversionOrWalletAddress?: SymbolConversion | string | null, walletAddress?: string | null, account?: any) {
        // Check if first argument is Hyperliquid instance
        if (exchangeOrParent instanceof Hyperliquid) {
            this.parent = exchangeOrParent;
            this.exchange = exchangeOrParent.exchange;
            this.infoApi = exchangeOrParent.info;
            this.symbolConversion = exchangeOrParent.symbolConversion;
            this.walletAddress = exchangeOrParent.isAuthenticated() ? exchangeOrParent.isAuthenticated().toString() : null;
            this.account = account;
        } else {
            // Original constructor
            this.exchange = exchangeOrParent;
            this.infoApi = infoApiOrPrivateKey as InfoAPI;
            if (privateKeyOrSymbolConversion && typeof privateKeyOrSymbolConversion === 'string') {
                this.wallet = new ethers.Wallet(privateKeyOrSymbolConversion);
            }
            this.symbolConversion = symbolConversionOrWalletAddress as SymbolConversion;
            this.walletAddress = walletAddress || null;
            this.account = account;
        }
    }

    private getUserAddress(): string {
        if (!this.walletAddress && !this.wallet?.address) {
            throw new Error('No wallet address available. Please provide a wallet address or private key.');
        }
        return this.walletAddress || this.wallet!.address;
    }

    async cancelAllOrders(symbol?: string): Promise<CancelOrderResponse> {
        try {
            const address = this.getUserAddress();
            const openOrders: UserOpenOrders = await this.infoApi.getUserOpenOrders(address);

            let ordersToCancel: UserOpenOrders;
            
            for (let order of openOrders) {
                order.coin = await this.symbolConversion.convertSymbol(order.coin);
            }

            if (symbol) {
                ordersToCancel = openOrders.filter(order => order.coin === symbol);
            } else {
                ordersToCancel = openOrders;
            }

            if (ordersToCancel.length === 0) {
                throw new Error('No orders to cancel');
            }

            const cancelRequests: CancelOrderRequest[] = ordersToCancel.map(order => ({
                coin: order.coin,
                o: order.oid
            }));

            const response = await this.exchange.cancelOrder(cancelRequests);
            return response;
        } catch (error) {
            throw error;
        }
    }

    async cancelAllSpotOrders(): Promise<CancelOrderResponse> {
        try {
            const address = this.getUserAddress();
            const openOrders: UserOpenOrders = await this.infoApi.getUserOpenOrders(address);
            
            // Get all spot assets to identify spot orders
            const { spot } = await this.getAllAssets();
            const spotSymbols = new Set(spot);
            
            // Process all orders to get proper symbol names
            for (let order of openOrders) {
                order.coin = await this.symbolConversion.convertSymbol(order.coin);
            }

            // Filter only spot orders by matching against known spot symbols
            const spotOrders = openOrders.filter(order => {
                const isSpot = spotSymbols.has(order.coin) || 
                               (!order.coin.endsWith('-PERP') && order.coin.includes('-'));
                return isSpot;
            });

            if (spotOrders.length === 0) {
                throw new Error('No spot orders to cancel');
            }

            const cancelRequests: CancelOrderRequest[] = spotOrders.map(order => ({
                coin: order.coin,
                o: order.oid
            }));

            const response = await this.exchange.cancelOrder(cancelRequests);
            return response;
        } catch (error) {
            throw error;
        }
    }

    async cancelAllPerpOrders(): Promise<CancelOrderResponse> {
        try {
            const address = this.getUserAddress();
            const openOrders: UserOpenOrders = await this.infoApi.getUserOpenOrders(address);
            
            // Get all perp assets to identify perp orders
            const { perp } = await this.getAllAssets();
            const perpSymbols = new Set(perp);
            
            // Process all orders to get proper symbol names
            for (let order of openOrders) {
                order.coin = await this.symbolConversion.convertSymbol(order.coin);
            }

            // Filter only perpetual orders by matching against known perp symbols
            const perpOrders = openOrders.filter(order => {
                const isPerp = perpSymbols.has(order.coin) || order.coin.endsWith('-PERP');
                return isPerp;
            });

            if (perpOrders.length === 0) {
                throw new Error('No perpetual orders to cancel');
            }

            const cancelRequests: CancelOrderRequest[] = perpOrders.map(order => ({
                coin: order.coin,
                o: order.oid
            }));

            const response = await this.exchange.cancelOrder(cancelRequests);
            return response;
        } catch (error) {
            throw error;
        }
    }

    async getAllAssets(): Promise<{ perp: string[], spot: string[] }> {
        return await this.symbolConversion.getAllAssets();
    }

    private DEFAULT_SLIPPAGE = 0.05;

    private async getSlippagePrice(
        symbol: string,
        isBuy: boolean,
        slippage: number,
        px?: number
    ): Promise<number> {
        const convertedSymbol = await this.symbolConversion.convertSymbol(symbol);
        if (!px) {
            const allMids = await this.infoApi.getAllMids();
            px = Number(allMids[convertedSymbol]);
        }

        const isSpot = symbol.includes("-SPOT");

        //If not isSpot count how many decimals price has to use the same amount for rounding 
        const decimals = px.toString().split('.')[1]?.length || 0;

        console.log(decimals)

        px *= isBuy ? (1 + slippage) : (1 - slippage);
        return Number(px.toFixed(isSpot ? 8 : decimals-1));
    }

    async marketOpen(
        symbol: string,
        isBuy: boolean,
        size: number,
        px?: number,
        slippage: number = this.DEFAULT_SLIPPAGE,
        cloid?: string
    ): Promise<OrderResponse> {
        const convertedSymbol = await this.symbolConversion.convertSymbol(symbol);
        const slippagePrice = await this.getSlippagePrice(convertedSymbol, isBuy, slippage, px);
        console.log("Slippage Price: ", slippagePrice)
        
        const orderRequest: OrderRequest = {
            coin: convertedSymbol,
            is_buy: isBuy,
            sz: size,
            limit_px: slippagePrice,
            order_type: { limit: { tif: 'Ioc' } } as OrderType,
            reduce_only: false
        };

        if (cloid) {
            orderRequest.cloid = cloid;
        }
        console.log(orderRequest)
        return this.exchange.placeOrder(orderRequest);
    }

    async marketClose(
        symbol: string,
        size?: number,
        px?: number,
        slippage: number = this.DEFAULT_SLIPPAGE,
        cloid?: string
    ): Promise<OrderResponse> {
        const convertedSymbol = await this.symbolConversion.convertSymbol(symbol);
        const address = this.getUserAddress();
        const positions = await this.infoApi.perpetuals.getClearinghouseState(address);
        for (const position of positions.assetPositions) {
            const item = position.position;
            if (convertedSymbol !== item.coin) {
                continue;
            }
            const szi = parseFloat(item.szi);
            const closeSize = size || Math.abs(szi);
            const isBuy = szi < 0;
            
            // Get aggressive Market Price
            const slippagePrice = await this.getSlippagePrice(convertedSymbol, isBuy, slippage, px);
            
            // Market Order is an aggressive Limit Order IoC
            const orderRequest: OrderRequest = {
                coin: convertedSymbol,
                is_buy: isBuy,
                sz: closeSize,
                limit_px: slippagePrice,
                order_type: { limit: { tif: 'Ioc' } } as OrderType,
                reduce_only: true
            };

            if (cloid) {
                orderRequest.cloid = cloid;
            }

            return this.exchange.placeOrder(orderRequest);
        }
        
        throw new Error(`No position found for ${convertedSymbol}`);
    }

    async closeAllPositions(slippage: number = this.DEFAULT_SLIPPAGE): Promise<OrderResponse[]> {
        try {
            const address = this.getUserAddress();
            const positions = await this.infoApi.perpetuals.getClearinghouseState(address);
            const closeOrders: Promise<OrderResponse>[] = [];

            console.log(positions)

            for (const position of positions.assetPositions) {
                const item = position.position;
                if (parseFloat(item.szi) !== 0) {
                    const symbol = await this.symbolConversion.convertSymbol(item.coin, "forward");
                    closeOrders.push(this.marketClose(symbol, undefined, undefined, slippage));
                }
            }

            return await Promise.all(closeOrders);
        } catch (error) {
            throw error;
        }
    }
}
