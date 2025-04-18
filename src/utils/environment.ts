export const environment = {
    isBrowser: typeof window !== 'undefined' && typeof document !== 'undefined',
    isNode: typeof process !== 'undefined' && process.versions != null && process.versions.node != null,
    isReactNative: typeof navigator !== 'undefined' && 
                  (
                    // Modern way to detect React Native
                    (typeof navigator.userAgent === 'string' && 
                     navigator.userAgent.indexOf('ReactNative') >= 0) ||
                    // Backup detection method
                    (typeof global !== 'undefined' && 
                     ((global as any).navigator?.product === 'ReactNative' ||
                      global.hasOwnProperty('__REACT_NATIVE_DEBUGGER__')))
                  ),
    isWebWorker: typeof self === 'object' && self.constructor && self.constructor.name === 'DedicatedWorkerGlobalScope',
    isServiceWorker: typeof self === 'object' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope',
    
    // Helper methods
    hasNativeWebSocket(): boolean {
        if (this.isReactNative) {
            return true; // React Native has native WebSocket support
        }
        
        if (this.isBrowser) {
            return typeof WebSocket !== 'undefined';
        }
        
        if (this.isNode) {
            // Node.js v19+ has native WebSocket, but it might not be enabled by default
            return typeof (globalThis as any).WebSocket !== 'undefined';
        }
        
        return false;
    },

    supportsWebSocket(): boolean {
        // React Native has built-in WebSocket support
        if (this.isReactNative) {
            return true;
        }
        
        // First check for native support
        if (this.hasNativeWebSocket()) {
            return true;
        }

        // For Node.js without native support, try to load ws package
        if (this.isNode) {
            try {
                // Dynamic require to avoid bundling ws package in browser builds
                const WebSocket = (globalThis as any).require?.('ws');
                return typeof WebSocket === 'function';
            } catch {
                return false;
            }
        }

        return false;
    },
    
    supportsLocalStorage(): boolean {
        try {
            return this.isBrowser && 'localStorage' in window && window.localStorage !== null;
        } catch {
            return false;
        }
    },
    
    supportsCrypto(): boolean {
        if (this.isReactNative) {
            // React Native may use polyfills for crypto
            return true;
        }
        
        if (this.isBrowser) {
            return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
        }
        
        if (this.isNode) {
            try {
                // Node.js crypto module
                (globalThis as any).require('crypto');
                return true;
            } catch (e) {
                return false;
            }
        }
        
        if (this.isWebWorker || this.isServiceWorker) {
            return 'crypto' in self;
        }
        
        return false;
    },

    // Helper to get the appropriate global object
    getGlobalObject(): any {
        if (this.isBrowser) return window;
        if (this.isWebWorker || this.isServiceWorker) return self;
        if (this.isNode) return global;
        return globalThis;
    }
}; 