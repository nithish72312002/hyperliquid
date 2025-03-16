// Example script to demonstrate base-quote token mapping
const { Hyperliquid } = require('../');

async function showBaseQuoteMapping() {
  try {
    // Initialize the SDK
    const sdk = new Hyperliquid({
      testnet: false,       // Use mainnet
      enableWs: false       // Disable WebSocket
    });

    console.log('Fetching spot market data to show base-quote token mapping...');
    
    // Get the raw data
    const spotMetaAndAssetCtxs = await sdk.info.spot.getSpotMetaAndAssetCtxs(true);
    const spotMeta = spotMetaAndAssetCtxs[0];
    
    // Create our own mapping using BASE-QUOTE format instead of BASE-SPOT
    const baseQuoteMap = new Map();
    
    console.log('\n=== Spot Markets and Their Base-Quote Mappings ===');
    
    spotMeta.universe.forEach(market => {
      // Find base and quote tokens
      const baseToken = spotMeta.tokens.find(t => t.index === market.tokens[0]);
      const quoteToken = spotMeta.tokens.find(t => t.index === market.tokens[1]);
      
      if (baseToken && quoteToken) {
        // Create base-quote format name
        const baseQuoteFormat = `${baseToken.name}-${quoteToken.name}`;
        // Store the index as it would be in the SDK
        const index = 10000 + market.index;
        
        // Store in our map
        baseQuoteMap.set(baseQuoteFormat, {
          marketName: market.name,
          marketIndex: market.index,
          sdkIndex: index,
          baseToken: baseToken.name,
          quoteToken: quoteToken.name
        });
        
        console.log(`Exchange: "${market.name}" → Our format: "${baseQuoteFormat}" (SDK index: ${index})`);
      }
    });
    
    // Find base tokens with multiple quote tokens
    const baseTokens = new Map();
    
    for (const [baseQuoteFormat, info] of baseQuoteMap) {
      const { baseToken, quoteToken } = info;
      
      if (!baseTokens.has(baseToken)) {
        baseTokens.set(baseToken, []);
      }
      
      baseTokens.get(baseToken).push({
        quoteToken,
        format: baseQuoteFormat,
        marketInfo: info
      });
    }
    
    console.log('\n=== Base Tokens with Multiple Quote Pairs ===');
    
    let foundMultiQuote = false;
    
    for (const [baseToken, quotePairs] of baseTokens) {
      if (quotePairs.length > 1) {
        foundMultiQuote = true;
        console.log(`\n${baseToken} can be traded against ${quotePairs.length} different quote tokens:`);
        
        quotePairs.forEach(({ quoteToken, format, marketInfo }) => {
          console.log(`  ${format} (Market: ${marketInfo.marketName}, SDK Index: ${marketInfo.sdkIndex})`);
        });
        
        console.log('\nPlace orders example:');
        quotePairs.forEach(({ quoteToken, format }) => {
          console.log(`// To trade ${baseToken} against ${quoteToken}:`);
          console.log(`sdk.exchange.spot.placeOrder({
  asset: "${format}",  // Using BASE-QUOTE format
  side: "buy",
  price: "0.1",
  sz: "10"
});\n`);
        });
      }
    }
    
    if (!foundMultiQuote) {
      console.log('No tokens with multiple quote pairs found in the current market data.');
    }
    
    console.log('\n=== Comparison with Current SDK Implementation ===');
    console.log('Current SDK Format vs Proposed Format:');
    
    const currentAssets = await sdk.symbolConversion.getAllAssets();
    
    for (let i = 0; i < Math.min(10, currentAssets.spot.length); i++) {
      const currentFormat = currentAssets.spot[i];
      const baseToken = currentFormat.replace('-SPOT', '');
      
      // Find all possible base-quote formats for this base token
      const quotePairs = baseTokens.get(baseToken) || [];
      if (quotePairs.length > 0) {
        console.log(`Current: "${currentFormat}" → Proposed: "${quotePairs[0].format}"`);
        
        if (quotePairs.length > 1) {
          console.log(`  Also can be: ${quotePairs.slice(1).map(p => `"${p.format}"`).join(', ')}`);
        }
      }
    }
    
    console.log('\nThe proposed implementation would allow you to distinctly trade the same asset against different quote tokens.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
showBaseQuoteMapping();