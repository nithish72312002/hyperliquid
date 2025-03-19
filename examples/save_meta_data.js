// Simple script to save spot meta and perp meta data
const { Hyperliquid } = require('../');
const fs = require('fs');
const path = require('path');

async function saveMetaData() {
  try {
    // Initialize the SDK
    const sdk = new Hyperliquid({
      testnet: false,
      enableWs: false
    });

    // Initialize the SDK
    await sdk.initialize();
    
    // Get and save perp meta (converted response)
    const perpMeta = await sdk.info.perpetuals.getMetaAndAssetCtxs(false); // converted response
    fs.writeFileSync('perp_meta_converted.json', JSON.stringify(perpMeta, null, 2));
    console.log('Saved perp_meta_converted.json');
    
    // Get and save spot meta (converted response)
    const getSpotMetaAndAssetCtxs = await sdk.info.spot.getSpotMetaAndAssetCtxs(false); // converted response
    fs.writeFileSync('spot_meta_asset_ctxs_converted.json', JSON.stringify(getSpotMetaAndAssetCtxs, null, 2));
    console.log('Saved spot_meta_asset_ctxs_converted.json');

    const spotMeta = await sdk.info.spot.getSpotMeta(false); // converted response
    fs.writeFileSync('spot_meta_converted.json', JSON.stringify(spotMeta, null, 2));
    console.log('Saved spot_meta_converted.json');
  } catch (error) {
    console.error('Error:', error);
  }
}

saveMetaData();
