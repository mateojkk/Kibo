export const SUI_TESTNET_RPC = 'https://fullnode.testnet.sui.io:443';

export interface CoinMetadata {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

export const SUI_COIN: CoinMetadata = {
  symbol: 'SUI',
  name: 'Sui Native Token',
  address: '0x2::sui::SUI',
  decimals: 9,
};

// Whitelisted stablecoins supported for gasless transfers on Sui Testnet
export const SUI_STABLECOINS: CoinMetadata[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
    decimals: 6,
  },
  {
    symbol: 'FDUSD',
    name: 'First Digital USD',
    address: '0x3efec67d1d2b78b8719b167ee69b769f37c3f309a639d6cf12d7b420087d0c32::fdusd::FDUSD',
    decimals: 6,
  },
  {
    symbol: 'AUSD',
    name: 'Acala USD',
    address: '0x0d3f23a9d94444c207b6cfdf6ee3e3bdf8f2bbd3::ausd::AUSD',
    decimals: 6,
  },
  {
    symbol: 'USDY',
    name: 'Ondo US Dollar Yield',
    address: '0x127b4cb7dfaa248d6cf5c325c1106c6411516e885c4bf4ee44e3e3bdf8f2bbd3::usdy::USDY',
    decimals: 6,
  },
  {
    symbol: 'USDsui',
    name: 'Sui USD',
    address: '0x0974fa4b0559f972b20f187a55255476d0d210515155df987d6cf62::usdsui::USDsui',
    decimals: 6,
  }
];

export const ALL_SUPPORTED_COINS = [SUI_COIN, ...SUI_STABLECOINS];

export const EXPLORER_TX = (digest: string) =>
  `https://suiscan.xyz/testnet/tx/${digest}`;

export const EXPLORER_ADDR = (addr: string) =>
  `https://suiscan.xyz/testnet/account/${addr}`;

// Deployed Kibo package and shared ShieldedPool object IDs
export const KIBO_PACKAGE_ID = '0x5391d6f3dfef86a4c2140cb2c9f80cc0bc2fc8230509a25b17c2f6d2f3c0ce2f';
export const SHIELDED_POOL_ID = '0x8825c83d6f44d8c25cf62a4d3df8f2bbd391d6f3dfef86a4c2140cb2c9f80cc0';

