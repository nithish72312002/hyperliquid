/**
 * Test script to demonstrate the getEvmTokens function
 * Lists all coins that have an EVM contract
 */
const { Hyperliquid } = require('../');

async function testEvmTokens() {
  try {
    // Initialize the SDK
    const sdk = new Hyperliquid({
      testnet: false,       // Use testnet (change to false for mainnet)
      enableWs: false      // Disable WebSocket
    });

    console.log('Fetching all tokens with EVM contracts...');
    
    // Get the EVM tokens
    const evmTokens = await sdk.info.spot.getEvmTokens(true);
    
    console.log(`\nFound ${evmTokens.length} tokens with EVM contracts`);
    console.log('\n=== Tokens with EVM Contracts ===');
    console.log(JSON.stringify(evmTokens, null, 2));
    
    // Display in table format for better readability
    console.log('\nEVM Tokens Table:');
    console.log('---------------------------------------------------------------------------------------------------------------------------------');
    console.log('| Name\t\t| Index\t| EVM Address\t\t\t\t| System Address\t\t\t| Token ID\t\t\t|');
    console.log('---------------------------------------------------------------------------------------------------------------------------------');
    
    evmTokens.forEach(token => {
      // Format the output with proper padding
      const name = token.name.padEnd(8, ' ');
      const index = token.index.toString().padEnd(5, ' ');
      const evmAddress = token.evmAddress.padEnd(32, ' ');
      const systemAddress = token.systemAddress.padEnd(32, ' ');
      const tokenId = token.tokenId.padEnd(32, ' ');
      
      console.log(
        `| ${name}\t| ${index}\t| ${evmAddress}\t| ${systemAddress}\t| ${tokenId}\t|`
      );
    });
    
    console.log('---------------------------------------------------------------------------------------------------------------------------------');
    
  } catch (error) {
    console.error('Error fetching EVM tokens:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testEvmTokens()
  .then(() => console.log('\nTest completed successfully'))
  .catch(err => console.error('Test failed:', err));
