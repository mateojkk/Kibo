import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
async function test() {
  const state = await suiClient.getLatestSuiSystemState();
  console.log("Epoch:", state.epoch);
}
test();
