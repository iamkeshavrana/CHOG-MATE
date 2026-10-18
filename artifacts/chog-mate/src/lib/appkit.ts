import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "viem";
import { createConfig, http, injected } from "wagmi";
import { appConfig } from "@/lib/config";

export const monadNetwork = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [appConfig.monadRpcUrl] },
  },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://monadscan.com" },
  },
});

const projectId = appConfig.walletConnectProjectId;
export const wagmiAdapter = projectId
  ? new WagmiAdapter({
      projectId,
      networks: [monadNetwork],
    })
  : null;

const injectedWagmiConfig = createConfig({
  chains: [monadNetwork],
  connectors: [injected()],
  transports: {
    [monadNetwork.id]: http(appConfig.monadRpcUrl),
  },
});

export const wagmiConfig = wagmiAdapter?.wagmiConfig ?? injectedWagmiConfig;

export const appKit = wagmiAdapter
  ? createAppKit({
    adapters: [wagmiAdapter],
    projectId: projectId!,
    networks: [monadNetwork],
    metadata: {
      name: "CHOG MATE",
      description: "Meet. Match. Chog.",
      url: window.location.origin,
      icons: [],
    },
    themeMode: "light",
    features: { analytics: false },
  })
  : null;
