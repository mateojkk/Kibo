export const SUI_TESTNET_RPC = 'https://fullnode.testnet.sui.io:443';

export interface CoinMetadata {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

// Whitelisted stablecoins supported for gasless transfers on Sui Testnet
export const SUI_STABLECOINS: CoinMetadata[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimals: 6,
  }
];

export const ALL_SUPPORTED_COINS = [...SUI_STABLECOINS];

export const EXPLORER_TX = (digest: string) =>
  `https://testnet.suivision.xyz/txblock/${digest}`;

export const EXPLORER_ADDR = (addr: string) =>
  `https://testnet.suivision.xyz/account/${addr}`;

// Deployed Kibo package and shared ShieldedPool object IDs
export const KIBO_PACKAGE_ID = '0x5391d6f3dfef86a4c2140cb2c9f80cc0bc2fc8230509a25b17c2f6d2f3c0ce2f';
export const SHIELDED_POOL_ID = '0x8825c83d6f44d8c25cf62a4d3df8f2bbd391d6f3dfef86a4c2140cb2c9f80cc0';

