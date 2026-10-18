import { RefreshCw } from "lucide-react";
import { formatUnits } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { appConfig } from "@/lib/config";
import { monadNetwork } from "@/lib/appkit";

const erc20ReadAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export function ChogBalance() {
  const connection = useConnection();
  const address = connection.address;
  const onMonad = connection.isConnected && connection.chainId === monadNetwork.id;
  const decimals = useReadContract({
    address: appConfig.chogTokenAddress,
    abi: erc20ReadAbi,
    functionName: "decimals",
    chainId: monadNetwork.id,
    query: { enabled: onMonad, staleTime: 60 * 60 * 1000 },
  });
  const balance = useReadContract({
    address: appConfig.chogTokenAddress,
    abi: erc20ReadAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: monadNetwork.id,
    query: {
      enabled: Boolean(onMonad && address),
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  });

  if (!connection.isConnected) return null;
  const loading = onMonad && (balance.isLoading || decimals.isLoading);
  const error = !onMonad || balance.isError || decimals.isError;
  const value =
    balance.data !== undefined && decimals.data !== undefined
      ? formatTokenBalance(balance.data, decimals.data)
      : null;

  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-full border border-white/55 bg-white/75 px-3 py-2 text-[11px] font-semibold text-[#594d64] shadow-[0_4px_15px_#3823440b]"
      aria-live="polite"
      data-testid="status-chog-balance"
    >
      <span className="shrink-0 text-[#7851d9]">$CHOG</span>
      <span className="min-w-[3.5rem] truncate tabular-nums">
        {loading
          ? "Loading…"
          : error
            ? onMonad
              ? "Unavailable"
              : "Monad only"
            : value ?? "—"}
      </span>
      <button
        type="button"
        onClick={() => {
          void decimals.refetch();
          void balance.refetch();
        }}
        disabled={!onMonad || loading}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[#806c9c] transition hover:bg-[#f2ecff] disabled:opacity-50"
        aria-label="Refresh $CHOG balance"
        title={error ? "Balance unavailable. Retry" : "Refresh balance"}
      >
        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

function formatTokenBalance(value: bigint, decimals: number): string {
  const [whole = "0", fraction = ""] = formatUnits(value, decimals).split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const roundedFraction = fraction.slice(0, 4).replace(/0+$/, "");
  return roundedFraction ? `${groupedWhole}.${roundedFraction}` : groupedWhole;
}
