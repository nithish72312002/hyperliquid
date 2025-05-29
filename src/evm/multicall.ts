import { 
  Contract, 
  JsonRpcProvider, 
  Interface, 
  formatUnits
} from 'ethers';

// Define the types here instead of importing them
export interface TokenInfo {
  address: string;
  symbol?: string;
  decimals?: number;
}

export interface TokenBalance {
  address: string;
  symbol?: string;
  balance: bigint;
  decimals?: number;
  formattedBalance?: string;
}

export interface MultiCallOptions {
  formatBalances?: boolean;
  customAbi?: any[];
  methodName?: string;
  methodParams?: any[];
}

export interface CallData {
  target: string;
  callData: string;
}

export interface BalanceQueryResult {
  walletAddress: string;
  blockNumber?: bigint;
  balances: TokenBalance[];
}

// Hyperliquid-specific constants
export const HYPERLIQUID_RPC_URLS = {
  MAINNET: 'https://rpc.hyperliquid.xyz/evm',
  TESTNET: 'https://rpc.hyperliquid-testnet.xyz/evm'
};
export const HYPERLIQUID_MULTICALL_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';


// ERC20 ABI (minimal, just for balanceOf)
const erc20Abi = [
  {
    "constant": true,
    "inputs": [
      {
        "name": "_owner",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "name": "balance",
        "type": "uint256"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

// Multicall ABI (minimal, just for aggregate)
const multicallAbi = [
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "bytes",
            "name": "callData",
            "type": "bytes"
          }
        ],
        "internalType": "struct Multicall3.Call[]",
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "aggregate",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "blockNumber",
        "type": "uint256"
      },
      {
        "internalType": "bytes[]",
        "name": "returnData",
        "type": "bytes[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "getEthBalance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

export class MulticallClient {
  private provider: JsonRpcProvider;

  /**
   * Create a new MulticallClient for Hyperliquid chain
   * @param isTestnet Whether to use testnet environment
   */
  constructor(isTestnet: boolean = false) {
    const rpcUrl = isTestnet ? HYPERLIQUID_RPC_URLS.TESTNET : HYPERLIQUID_RPC_URLS.MAINNET;
    this.provider = new JsonRpcProvider(rpcUrl);
  }

  /**
   * Get balances for multiple tokens on Hyperliquid in a single multicall
   * 
   * @param walletAddress - The wallet address to check balances for
   * @param tokens - Array of token contracts to check
   * @param options - Optional configuration
   * @returns A promise resolving to balance data
   */
  public async getTokenBalances(
    walletAddress: string, 
    tokens: TokenInfo[],
    options: MultiCallOptions = {}
  ): Promise<BalanceQueryResult> {
    try {
      // Set defaults
      const methodName = options.methodName || 'balanceOf';
      const methodParams = options.methodParams || [walletAddress];
      const formatBalances = options.formatBalances !== undefined ? options.formatBalances : true;
      
      // Create multicall contract
      const multicallContract = new Contract(
        HYPERLIQUID_MULTICALL_ADDRESS, 
        multicallAbi, 
        this.provider
      );

      // Prepare calldata for token balances
      const callData = this.prepareCalldata(tokens, methodName, methodParams, options.customAbi);
      
      // Execute multicall
      const result = await multicallContract.aggregate.staticCall(callData);
      const blockNumber = result.blockNumber;
      const returnData = result.returnData;
      
      // Process balances
      const balances: TokenBalance[] = [];
      for (let i = 0; i < tokens.length; i++) {
        try {
          const token = tokens[i];
          const data = returnData[i];
          
          // Skip empty data or handle it properly
          if (!data || data === '0x' || data === '') {
            balances.push({
              address: token.address,
              symbol: token.symbol,
              balance: BigInt(0),
              decimals: token.decimals,
              formattedBalance: '0'
            });
            continue;
          }
          
          // Convert hex to BigInt
          const hexValue = data.startsWith('0x') ? data : `0x${data}`;
          let balance;
          try {
            balance = BigInt(hexValue);
          } catch (err) {
            // If BigInt conversion fails, fallback to zero
            balance = BigInt(0);
          }
          
          // Format balance if requested and decimals provided
          let formattedBalance;
          if (formatBalances && token.decimals !== undefined) {
            formattedBalance = formatUnits(balance, token.decimals);
          }
          
          balances.push({
            address: token.address,
            symbol: token.symbol,
            balance,
            decimals: token.decimals,
            formattedBalance
          });
        } catch (error) {
          // Quietly handle errors without console logs to avoid issues in React Native
          balances.push({
            address: tokens[i].address,
            symbol: tokens[i].symbol,
            balance: BigInt(0),
            decimals: tokens[i].decimals,
            formattedBalance: '0'
          });
        }
      }
      
      return {
        walletAddress,
        blockNumber,
        balances
      };
    } catch (error) {
      // Quietly handle errors without console logs to avoid issues in React Native
      return {
        walletAddress,
        balances: []
      };
    }
  }

  /**
   * Get native HYPE token balance for a wallet
   * @param walletAddress The wallet address to check balance for
   * @returns The balance as a TokenBalance object
   */
  public async getNativeBalance(walletAddress: string): Promise<TokenBalance> {
    try {
      // Use multicall's getEthBalance to get the native token balance
      const multicallContract = new Contract(
        HYPERLIQUID_MULTICALL_ADDRESS, 
        multicallAbi, 
        this.provider
      );

      const result = await multicallContract.getEthBalance.staticCall(walletAddress);
      const balance = BigInt(result || 0);
      
      // Format the balance to 18 decimals (native token standard)
      const formattedBalance = formatUnits(balance, 18);
      
      return {
        address: "0x0000000000000000000000000000000000000000", // Zero address for native token
        symbol: "HYPE",
        balance,
        decimals: 18,
        formattedBalance
      };
    } catch (error) {
      // Return zero balance on error
      return {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "HYPE",
        balance: BigInt(0),
        decimals: 18,
        formattedBalance: "0"
      };
    }
  }

  /**
   * Prepare calldata for multicall contract
   */
  private prepareCalldata(
    tokens: TokenInfo[],
    methodName: string,
    methodParams: any[],
    customAbi?: any[]
  ): CallData[] {
    // Use custom ABI if provided, otherwise use ERC20 ABI
    const abi = customAbi || erc20Abi;
    const contractInterface = new Interface(abi);
    
    // Encode the function call
    const encodedCalldata = contractInterface.encodeFunctionData(methodName, methodParams);
    
    // Create call data for each token
    return tokens.map(token => ({
      target: token.address,
      callData: encodedCalldata,
    }));
  }
}
