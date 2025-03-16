// Script to test the new base-quote token format implementation
const { Hyperliquid } = require('../');

async function testSymbolConversion() {
  try {
    console.log('Testing base-quote token format implementation...');
    
    // Initialize SDK
    const sdk = new Hyperliquid({
      testnet: false,       // Use mainnet
      enableWs: false       // Disable WebSocket
    });
    
    // Initialize the symbol conversion explicitly
    console.log('Initializing symbol conversion...');
    await sdk.symbolConversion.initialize();
    
    // 1. Get available assets
    const assets = await sdk.symbolConversion.getAllAssets();
    
    console.log('\n== Available Assets ==');
    console.log(`Spot Assets: ${assets.spot.length} total`);
    if (assets.spot.length > 0) {
      console.log('Sample spot assets:', assets.spot.slice(0, 10));
    }
    
    console.log(`\nPerp Assets: ${assets.perp.length} total`);
    if (assets.perp.length > 0) {
      console.log('Sample perp assets:', assets.perp.slice(0, 5));
    }
    
    // 2. Test specific asset lookups
    console.log('\n== Testing Asset Index Lookups ==');
    
    // Try with a few spot assets
    if (assets.spot.length > 0) {
      for (const symbol of assets.spot.slice(0, 5)) {
        const index = await sdk.symbolConversion.getAssetIndex(symbol);
        console.log(`${symbol} → ${index}`);
      }
    }
    
    // 3. Find base tokens with multiple quote pairings
    console.log('\n== Multiple Quote Token Support ==');
    
    // Group by base token
    const baseTokens = new Map();
    
    assets.spot.forEach(symbol => {
      const [base, quote] = symbol.split('-');
      if (!baseTokens.has(base)) {
        baseTokens.set(base, []);
      }
      baseTokens.get(base).push({ quote, symbol });
    });
    
    // Log tokens with multiple quote pairs
    const multiQuoteTokens = [...baseTokens.entries()]
      .filter(([_, pairs]) => pairs.length > 1)
      .map(([base, pairs]) => ({ base, pairs }));
    
    if (multiQuoteTokens.length > 0) {
      console.log('\nFound tokens with multiple quote pairs:');
      for (const { base, pairs } of multiQuoteTokens) {
        console.log(`\n${base} is paired with ${pairs.length} quote tokens:`);
        
        // Test lookups for each pair
        for (const { quote, symbol } of pairs) {
          const index = await sdk.symbolConversion.getAssetIndex(symbol);
          console.log(`  ${symbol} → ${index}`);
        }
      }
      
      // Test the first multi-quote token with order placement simulation
      if (multiQuoteTokens.length > 0) {
        const { base, pairs } = multiQuoteTokens[0];
        
        console.log(`\n== Order Placement Simulation for ${base} ==`);
        console.log("Now you can place orders with different quote tokens:");
        
        for (const { quote, symbol } of pairs) {
          console.log(`\nTo trade ${base} against ${quote}:`);
          console.log(`sdk.exchange.spot.placeOrder({
  asset: "${symbol}",  // Using full BASE-QUOTE format
  side: "buy",
  price: "0.1",
  sz: "10"
});`);
        }
      }
    } else {
      console.log('No tokens with multiple quote pairs found in the current market data');
    }
    
    // 4. Test exchange name conversions
    console.log('\n== Exchange Name Conversion ==');
    if (assets.spot.length > 0) {
      const spotSymbol = assets.spot[0];
      const exchangeName = await sdk.symbolConversion.convertSymbol(spotSymbol, "reverse");
      console.log(`${spotSymbol} ↔ ${exchangeName} (Exchange format)`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testSymbolConversion();
