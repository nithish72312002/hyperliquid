/**
 * Test script to check the meta endpoint and verify symbol conversion
 * This will help check if there are any issues with market name conversion
 */
const fs = require('fs');
const { Hyperliquid } = require('../');

async function testMeta() {
  try {
    // Initialize the SDK
    const sdk = new Hyperliquid({
      testnet: false,       // Use mainnet
      enableWs: false       // Disable WebSocket
    });
    
    // Make sure to initialize the SDK first
    await sdk.initialize();
    
    console.log('Fetching meta data...');
    
    // Get both raw and converted meta data
    const rawMeta = await sdk.info.perpetuals.getMeta(true);
    const convertedMeta = await sdk.info.perpetuals.getMeta(false);
    
    // Save to JSON files
    const rawOutputPath = './meta_raw.json';
    const convertedOutputPath = './meta_converted.json';
    
    fs.writeFileSync(rawOutputPath, JSON.stringify(rawMeta, null, 2));
    fs.writeFileSync(convertedOutputPath, JSON.stringify(convertedMeta, null, 2));
    
    console.log(`Raw meta data saved to ${rawOutputPath}`);
    console.log(`Converted meta data saved to ${convertedOutputPath}`);
    
    // Sample comparison to check symbol conversion
    if (rawMeta.universe && rawMeta.universe.length) {
      console.log('\nSymbol conversion comparison (first 5 markets):');
      console.log('---------------------------------------------');
      
      for (let i = 0; i < Math.min(5, rawMeta.universe.length); i++) {
        const rawMarket = rawMeta.universe[i];
        const convertedMarket = convertedMeta.universe[i];
        
        console.log(`Raw name: "${rawMarket.name}" → Converted name: "${convertedMarket.name}"`);
      }
      
      // Also check for any markets with -PERP suffix that shouldn't have it
      const suspiciousMarkets = convertedMeta.universe.filter(market => 
        market.name && market.name.endsWith('-PERP') && !rawMeta.universe[market.idx].isPerp
      );
      
      if (suspiciousMarkets.length > 0) {
        console.log('\nPotential incorrect symbol conversion:');
        console.log('-----------------------------------');
        suspiciousMarkets.forEach(market => {
          console.log(`Market "${market.name}" has -PERP suffix but isPerp=${rawMeta.universe[market.idx].isPerp}`);
        });
      } else {
        console.log('\nNo suspicious market name conversions found.');
      }
    }
    
    // Also fetch and test spot meta to check symbol conversion
    console.log('\nFetching spot meta data...');
    
    const rawSpotMeta = await sdk.info.spot.getSpotMetaAndAssetCtxs(true);
    const convertedSpotMeta = await sdk.info.spot.getSpotMetaAndAssetCtxs(false);
    
    // Save to JSON files
    const rawSpotOutputPath = './spot_meta_raw.json';
    const convertedSpotOutputPath = './spot_meta_converted.json';
    
    fs.writeFileSync(rawSpotOutputPath, JSON.stringify(rawSpotMeta, null, 2));
    fs.writeFileSync(convertedSpotOutputPath, JSON.stringify(convertedSpotMeta, null, 2));
    
    console.log(`Raw spot meta saved to ${rawSpotOutputPath}`);
    console.log(`Converted spot meta saved to ${convertedSpotOutputPath}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response error data:', error.response.data);
    }
  }
}

// Run the test
testMeta();
