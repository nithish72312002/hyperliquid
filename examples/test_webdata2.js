const fs = require('fs');


const { Hyperliquid } = require('../');

// Path for the log file
const logFilePath = './webdata2_subscription_logs.json';

// Create or clear the log file
fs.writeFileSync(logFilePath, '');

// Function to append data to the log file
function appendToLog(data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    data
  };
  
  // Append to file with a newline
  fs.appendFileSync(logFilePath, JSON.stringify(logEntry, null, 2) + ',\n');
  console.log(`[${timestamp}] Received update, logged to ${logFilePath}`);
}

async function testWebdata2Subscription() {
  try {
    console.log('Initializing Hyperliquid SDK with WebSocket support...');
    
    // Initialize the SDK with WebSocket support enabled
    const sdk = new Hyperliquid({
      testnet: true,     // Use testnet (change to false for mainnet)
      enableWs: true     // Enable WebSocket
    });
    
    // Optional: Specify a user address to get user-specific data
    const userAddress = '0x93c6d60b83c43C925538215Ee467De7ed5B4D4d9';
    
    console.log(`Starting webData2 subscription for user: ${userAddress || 'none (zero address)'}`);
    console.log(`Updates will be logged to: ${logFilePath}`);
    
    // Create an array to store all log entries for final output
    const allLogs = [];
    
    // Connect to the WebSocket
    console.log('Connecting to WebSocket...');
    await sdk.connect();
    console.log('Connected to WebSocket');
    
    // Subscribe to webData2 updates
    console.log('Subscribing to webData2 updates...');
    const subscription = await sdk.subscriptions.subscribeToWebData2(userAddress, (data) => {
      // Log to console
      console.log('Received webData2 update');
      
      // Add to log file
      appendToLog(data);
      
      // Add to in-memory array
      allLogs.push(data);
    });
    
    console.log('Successfully subscribed to webData2 events');
    console.log('Press Ctrl+C to stop the subscription and save all logs');
    
    // Keep the script running for 60 seconds, then unsubscribe
    setTimeout(async () => {
      console.log('Unsubscribing after 60 seconds...');
      
      // Unsubscribe from webData2
      await sdk.subscriptions.unsubscribeFromWebData2(userAddress);
      
      // Save all accumulated logs to a consolidated file
      const consolidatedFilePath = './webdata2_all_logs.json';
      fs.writeFileSync(consolidatedFilePath, JSON.stringify(allLogs, null, 2));
      console.log(`All logs saved to: ${consolidatedFilePath}`);
      
      // Exit the process
      process.exit(0);
    }, 60000); // Run for 60 seconds
    
  } catch (error) {
    console.error('Error in webData2 subscription:', error);
    process.exit(1);
  }
}

// Run the test
testWebdata2Subscription();