// ─────────────────────────────────────────────────────────────────────────────
// PayForge Orchestra — Verified Token Addresses
// Source: https://docs.celo.org/tooling/contracts/token-contracts
// All addresses verified against official Celo documentation June 2026
// ─────────────────────────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  CELO_SEPOLIA: 11142220,
  CELO: 42220,
} as const;

export const ADDRESSES = {
  [11142220]: {
    // ── Mento Broker ─────────────────────────────────────────────────────────
    mentoBroker: "0xB9Ae2065142EB79b6c5EB1E8778F883fad6B07Ba" as `0x${string}`,
    // ── Core stablecoins ─────────────────────────────────────────────────────
    USDm: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" as `0x${string}`, // Mento Dollar
    EURm: "0xA99dC247d6b7B2E3ab48a1fEE101b83cD6aCd82a" as `0x${string}`, // Mento Euro
    // ── African corridors ────────────────────────────────────────────────────
    NGNm: "0x3d5ae86F34E2a82771496D140daFAEf3789dF888" as `0x${string}`, // Mento Nigerian Naira ★ PRIMARY
    KESm: "0xC7e4635651E3e3Af82b61d3E23c159438daE3BbF" as `0x${string}`, // Mento Kenyan Shilling
    GHSm: "0x5e94B8C872bD47BC4255E60ECBF44D5E66e7401C" as `0x${string}`, // Mento Ghanaian Cedi
    ZARm: "0x10CCfB235b0E1Ed394bACE4560C3ed016697687e" as `0x${string}`, // Mento South African Rand
    XOFm: "0x5505b70207aE3B826c1A7607F19F3Bf73444A082" as `0x${string}`, // Mento West African CFA
    // ── Other Mento stablecoins ──────────────────────────────────────────────
    BRLm: "0x2294298942fdc79417DE9E0D740A4957E0e7783a" as `0x${string}`, // Mento Brazilian Real
    COPm: "0x5F8d55c3627d2dc0a2B4afa798f877242F382F67" as `0x${string}`, // Mento Colombian Peso
    PHPm: "0x0352976d940a2C3FBa0C3623198947Ee1d17869E" as `0x${string}`, // Mento Philippine Peso
    CADm: "0xF151c9a13b78C84f93f50B8b3bC689fedc134F60" as `0x${string}`, // Mento Canadian Dollar
    CHFm: "0x284E9b7B623eAE866914b7FA0eB720C2Bb3C2980" as `0x${string}`, // Mento Swiss Franc
    GBPm: "0x85F5181Abdbf0e1814Fc4358582Ae07b8eBA3aF3" as `0x${string}`, // Mento British Pound
    AUDm: "0x5873Faeb42F3563dcD77F0fbbdA818E6d6DA3139" as `0x${string}`, // Mento Australian Dollar
    JPYm: "0x85Bee67D435A39f7467a8a9DE34a5B73D25Df426" as `0x${string}`, // Mento Japanese Yen
    // ── Non-Mento stablecoins (on Celo Sepolia) ──────────────────────────────
    USDC: "0x01C5C0122039549Ad1493B8220cABEdD739BC44E" as `0x${string}`,
    USDT: "0xd077A400968890Eacc75cdc901F0356c943e4fDb" as `0x${string}`,
    // ── Native token ─────────────────────────────────────────────────────────
    CELO: "0xdDc9bE57f553fe75752D61606B94CBD7e0264eF8" as `0x${string}`,
    // ── Network ──────────────────────────────────────────────────────────────
    rpc: "https://forno.celo-sepolia.celo-testnet.org",
    explorer: "https://sepolia.celoscan.io",
    blockscout: "https://celo-sepolia.blockscout.com",
    scan8004: "https://8004scan.io",
    faucet: "https://faucet.celo.org/celo-sepolia",
    // ── ERC-8004 Registries ───────────────────────────────────────────────────
    erc8004Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
    erc8004Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as `0x${string}`,
  },
  [42220]: {
    // ── Mento Broker ─────────────────────────────────────────────────────────
    mentoBroker: "0x777a8255ca72412f0d706dc03c9d1987306b4cad" as `0x${string}`,
    // ── Core stablecoins ─────────────────────────────────────────────────────
    USDm: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`,
    EURm: "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73" as `0x${string}`,
    // ── African corridors ────────────────────────────────────────────────────
    NGNm: "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71" as `0x${string}`, // ★ PRIMARY
    KESm: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0" as `0x${string}`,
    GHSm: "0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313" as `0x${string}`,
    ZARm: "0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6" as `0x${string}`,
    XOFm: "0x73F93dcc49cB8A239e2032663e9475dd5ef29A08" as `0x${string}`,
    // ── Other Mento stablecoins ──────────────────────────────────────────────
    BRLm: "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787" as `0x${string}`,
    COPm: "0x8A567e2aE79CA692Bd748aB832081C45de4041eA" as `0x${string}`,
    PHPm: "0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B" as `0x${string}`,
    CADm: "0xff4Ab19391af240c311c54200a492233052B6325" as `0x${string}`,
    CHFm: "0xb55a79F398E759E43C95b979163f30eC87Ee131D" as `0x${string}`,
    GBPm: "0xCCF663b1fF11028f0b19058d0f7B674004a40746" as `0x${string}`,
    AUDm: "0x7175504C455076F15c04A2F90a8e352281F492F9" as `0x${string}`,
    JPYm: "0xc45eCF20f3CD864B32D9794d6f76814aE8892e20" as `0x${string}`,
    // ── Non-Mento stablecoins ────────────────────────────────────────────────
    USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`,
    USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as `0x${string}`,
    CELO: "0x471EcE3750Da237f93B8E339c536989b8978a438" as `0x${string}`,
    // ── Network ──────────────────────────────────────────────────────────────
    rpc: "https://rpc.ankr.com/celo",
    explorer: "https://celoscan.io",
    blockscout: "https://celo.blockscout.com",
    scan8004: "https://8004scan.io",
    faucet: "",
    erc8004Identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as `0x${string}`,
    erc8004Reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as `0x${string}`,
  },
} as const;

export type SupportedChainId = keyof typeof ADDRESSES;

export function getAddresses(chainId: number) {
  if (chainId !== CHAIN_IDS.CELO_SEPOLIA && chainId !== CHAIN_IDS.CELO) {
    throw new Error(`Unsupported chainId: ${chainId}. Use 11142220 (Celo Sepolia) or 42220 (Celo Mainnet).`);
  }
  return ADDRESSES[chainId as SupportedChainId];
}

// ── All Mento token symbols — used for display across the app ──────────────
export const CURRENCY_SYMBOLS: Record<string, string> = {
  // Celo Sepolia
  "0xde9e4c3ce781b4ba68120d6261cbad65ce0ab00b": "USDm",
  "0x3d5ae86f34e2a82771496d140daafaef3789df888": "NGNm",
  "0xc7e4635651e3e3af82b61d3e23c159438dae3bbf": "KESm",
  "0xa99dc247d6b7b2e3ab48a1fee101b83cd6acd82a": "EURm",
  "0x2294298942fdc79417de9e0d740a4957e0e7783a": "BRLm",
  "0x5505b70207ae3b826c1a7607f19f3bf73444a082": "XOFm",
  "0x5f8d55c3627d2dc0a2b4afa798f877242f382f67": "COPm",
  "0x0352976d940a2c3fba0c3623198947ee1d17869e": "PHPm",
  "0xf151c9a13b78c84f93f50b8b3bc689fedc134f60": "CADm",
  "0x284e9b7b623eae866914b7fa0eb720c2bb3c2980": "CHFm",
  "0x85f5181abdbf0e1814fc4358582ae07b8eba3af3": "GBPm",
  "0x5873faeb42f3563dcd77f0fbbda818e6d6da3139": "AUDm",
  "0x85bee67d435a39f7467a8a9de34a5b73d25df426": "JPYm",
  "0x5e94b8c872bd47bc4255e60ecbf44d5e66e7401c": "GHSm",
  "0x10ccfb235b0e1ed394bace4560c3ed016697687e": "ZARm",
  "0x01c5c0122039549ad1493b8220cabedd739bc44e": "USDC",
  "0xd077a400968890eacc75cdc901f0356c943e4fdb": "USDT",
  // Celo Mainnet
  "0x765de816845861e75a25fca122bb6898b8b1282a": "USDm",
  "0xe2702bd97ee33c88c8f6f92da3b733608aa76f71": "NGNm",
  "0x456a3d042c0dbd3db53d5489e98dfb038553b0d0": "KESm",
  "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73": "EURm",
  "0xe8537a3d056da446677b9e9d6c5db704eaab4787": "BRLm",
  "0x73f93dcc49cb8a239e2032663e9475dd5ef29a08": "XOFm",
  "0x8a567e2ae79ca692bd748ab832081c45de4041ea": "COPm",
  "0x105d4a9306d2e55a71d2eb95b81553ae1dc20d7b": "PHPm",
  "0xfaea5f3404bba20d3cc2f8c4b0a888f55a3c7313": "GHSm",
  "0x4c35853a3b4e647fd266f4de678dcc8fec410bf6": "ZARm",
  "0xceba9300f2b948710d2653dd7b07f33a8b32118c": "USDC",
  "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e": "USDT",
};

export function getSymbol(address: string): string {
  return CURRENCY_SYMBOLS[address.toLowerCase()] ?? address.slice(0, 6) + "...";
}
