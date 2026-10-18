import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, ExternalLink, RefreshCw } from "lucide-react";
import {
  getGetMeQueryOptions,
  getGetMeQueryKey,
  getGetNftOwnershipQueryKey,
  getMe,
  useCreateAuthChallenge,
  useGetNftOwnership,
  useVerifyWallet,
} from "@workspace/api-client-react";
import {
  useConnect,
  useConnection,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { useLocation } from "wouter";
import { appKit, monadNetwork } from "@/lib/appkit";
import { walletAuthConfigured } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { ChogArtwork } from "@/components/shared";
import ManualAddressScan from "@/components/manual-address-scan";

export default function WalletAuthPanel({
  autoOpen = false,
  showManualAddressScan = true,
  returnTo,
}: {
  autoOpen?: boolean;
  showManualAddressScan?: boolean;
  returnTo?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [openingWallet, setOpeningWallet] = useState(false);
  const [appKitModalOpen, setAppKitModalOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const challenge = useCreateAuthChallenge();
  const verify = useVerifyWallet();
  const connection = useConnection();
  const {
    connectAsync,
    connectors,
    isPending: isConnectPending,
  } = useConnect();
  const { disconnectAsync, isPending: isDisconnectPending } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchPending } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const autoOpened = useRef(false);
  const address = connection.address;
  const isConnected = connection.isConnected;
  const isWrongNetwork = isConnected && connection.chainId !== monadNetwork.id;
  const ownership = useGetNftOwnership(address ?? "", {
    query: {
      enabled: Boolean(address && isConnected && !isWrongNetwork),
      queryKey: getGetNftOwnershipQueryKey(address ?? ""),
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 30_000,
    },
  });
  const ownershipMatchesWallet =
    Boolean(address) &&
    ownership.data?.walletAddress.toLowerCase() === address?.toLowerCase();
  const ownedChogs =
    ownershipMatchesWallet && ownership.data?.verified
      ? ownership.data.chogs.filter(
          (chog) =>
            chog.verified &&
            chog.ownerWallet.toLowerCase() === address?.toLowerCase(),
        )
      : [];
  const requestedDestination = safeInternalReturnTo(returnTo);
  const isConnecting =
    connection.isConnecting ||
    connection.isReconnecting ||
    isConnectPending ||
    openingWallet ||
    (appKitModalOpen && !isConnected);

  useEffect(() => {
    if (!appKit) return;
    setAppKitModalOpen(appKit.getState().open);
    return appKit.subscribeState((state) => setAppKitModalOpen(state.open));
  }, []);

  const openWallet = useCallback(async () => {
    setFeedback("");
    setOpeningWallet(true);
    try {
      if (appKit) {
        await appKit.open({ view: "Connect" });
        return;
      }

      const injectedConnector = connectors.find(
        (connector) => connector.id === "injected",
      );
      if (!injectedConnector) {
        throw new Error(
          "No browser wallet was detected. Install or unlock a wallet and try again.",
        );
      }
      await connectAsync({ connector: injectedConnector });
    } finally {
      setOpeningWallet(false);
    }
  }, [connectAsync, connectors]);

  useEffect(() => {
    if (!autoOpen || autoOpened.current || isConnected) return;
    autoOpened.current = true;
    void openWallet().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      setFeedback(`The wallet connection could not be opened. ${message}`);
    });
  }, [autoOpen, isConnected, openWallet]);

  async function switchToMonad() {
    setFeedback("");
    try {
      await switchChainAsync({ chainId: monadNetwork.id });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      setFeedback(`Could not switch to Monad. ${message}`);
    }
  }

  async function disconnectWallet() {
    setFeedback("");
    try {
      await disconnectAsync();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      setFeedback(`Wallet disconnect failed. ${message}`);
    }
  }

  async function connect() {
    setFeedback("");
    if (!isConnected) {
      try {
        await openWallet();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Please try again.";
        setFeedback(`Wallet connection failed. ${message}`);
      }
      return;
    }
    if (isWrongNetwork) {
      setFeedback("Switch to Monad Mainnet before verifying your wallet.");
      return;
    }
    if (!address || !walletClient) {
      setFeedback(
        "Your wallet connection is still loading. Try again in a moment.",
      );
      return;
    }
    if (!walletAuthConfigured || !supabase) {
      setFeedback(
        "Your wallet is connected, but account sign-in is not configured yet.",
      );
      return;
    }

    setBusy(true);
    try {
      const authChallenge = await challenge.mutateAsync({
        data: { walletAddress: address },
      });
      const signature = await walletClient.signMessage({
        account: address,
        message: authChallenge.message,
      });
      const session = await verify.mutateAsync({
        data: { walletAddress: address, nonce: authChallenge.nonce, signature },
      });
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (sessionError) throw sessionError;
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      let destination =
        requestedDestination?.startsWith("/profile")
          ? requestedDestination
          : "/my-chog";
      if (session.hasChog) {
        try {
          const current = await queryClient.fetchQuery({
            ...getGetMeQueryOptions(),
            queryFn: () => getMe(),
            staleTime: 0,
          });
          if (current.hasProfile && current.profile) {
            destination = requestedDestination ?? "/discover";
          }
        } catch {
          // If the profile lookup is unavailable, land on the ownership gallery.
        }
      }
      navigate(destination);
    } catch (error) {
      const err = error as { code?: number; message?: string };
      setFeedback(
        err.code === 4001
          ? "Wallet signing was cancelled. Your wallet remains connected."
          : err.message ||
              "Wallet verification could not be completed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <button
          onClick={() => void connect()}
          disabled={busy || isConnecting || isWrongNetwork}
          className="button-primary inline-flex min-h-[54px] items-center gap-3 rounded-full px-7 text-sm font-bold disabled:cursor-wait disabled:opacity-70"
          data-testid="button-connect-wallet"
        >
          {isConnecting
            ? "Connecting wallet…"
            : busy
              ? "Verifying your wallet…"
              : isConnected
                ? "Verify wallet"
                : "Connect wallet"}
          <ArrowRight size={17} />
        </button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#92869a]">
          <span
            role="status"
            aria-live="polite"
            data-testid="status-wallet-connection"
          >
            {isConnecting
              ? "Connecting to wallet…"
              : isWrongNetwork
                ? `Wrong network · ${connection.chain?.name ?? `Chain ${connection.chainId}`}`
                : isConnected
                  ? `Connected to Monad · ${address?.slice(0, 6)}…${address?.slice(-4)}`
                  : "A signature proves ownership. It never moves funds."}
          </span>
          {isConnected && (
            <button
              type="button"
              onClick={() => void disconnectWallet()}
              disabled={isDisconnectPending}
              className="font-semibold text-[#a3315e] underline-offset-4 hover:underline disabled:opacity-60"
              data-testid="button-wallet-disconnect"
            >
              {isDisconnectPending ? "Disconnecting…" : "Disconnect"}
            </button>
          )}
        </div>
      </div>
      {showManualAddressScan && <ManualAddressScan returnTo={returnTo} />}
      {isWrongNetwork && (
        <div
          className="mt-3 flex flex-col gap-2 rounded-2xl border border-[#ead8ce] bg-[#fff8f1] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
          data-testid="status-wallet-wrong-network"
        >
          <p className="text-sm leading-5 text-[#755247]">
            CHOG MATE runs on Monad Mainnet. Switch networks to continue.
          </p>
          <button
            type="button"
            onClick={() => void switchToMonad()}
            disabled={isSwitchPending}
            className="button-soft inline-flex min-h-10 shrink-0 items-center justify-center rounded-full px-4 text-xs font-bold disabled:opacity-60"
            data-testid="button-switch-to-monad"
          >
            {isSwitchPending ? "Switching…" : "Switch to Monad"}
          </button>
        </div>
      )}
      {isConnected && !isWrongNetwork && (
        <section
          className="surface mt-4 w-full max-w-xl rounded-[24px] p-4 sm:p-5"
          aria-label="Connected wallet Chog ownership"
          data-testid="panel-wallet-chog-ownership"
        >
          {ownership.isLoading ||
          (!ownershipMatchesWallet && !ownership.isError) ? (
            <p
              className="flex items-center gap-2 text-sm font-semibold text-[#715795]"
              role="status"
            >
              <RefreshCw size={15} className="animate-spin" />
              Checking Chog ownership for this wallet…
            </p>
          ) : ownership.isError ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="display text-lg font-extrabold text-[#24133f]">
                  Ownership check unavailable
                </h2>
                <p className="mt-1 text-xs leading-5 text-[#82778c]">
                  We couldn’t verify this wallet on Monad. No ownership result
                  has been assumed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void ownership.refetch()}
                disabled={ownership.isFetching}
                className="button-soft inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-xs font-bold disabled:opacity-60"
                data-testid="button-retry-chog-ownership"
              >
                <RefreshCw
                  size={13}
                  className={ownership.isFetching ? "animate-spin" : ""}
                />
                Try again
              </button>
            </div>
          ) : ownedChogs.length === 0 ? (
            <div>
              <h2
                className="display text-xl font-extrabold text-[#24133f]"
                data-testid="heading-no-chog-found"
              >
                No Chog Found
              </h2>
              <p
                className="mt-1 text-sm leading-6 text-[#82778c]"
                data-testid="text-no-chog-profile-requirement"
              >
                A Chog NFT is required to create a CHOG MATE profile. Connect a
                wallet that owns a Chog NFT to continue.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <BadgeCheck size={16} className="text-[#447a43]" />
                <div>
                  <h2 className="display text-lg font-extrabold text-[#24133f]">
                    {ownedChogs.length} Chog{ownedChogs.length === 1 ? "" : "s"}{" "}
                    found
                  </h2>
                  <p className="text-xs text-[#82778c]">
                    Verified against Monad for this wallet.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ownedChogs.map((chog) => (
                  <article
                    key={chog.tokenId}
                    className="overflow-hidden rounded-2xl border border-[#eee7f2] bg-white"
                    data-testid={`card-connected-chog-${chog.tokenId}`}
                  >
                    <div className="aspect-square bg-[#f4eddf]">
                      <ChogArtwork chog={chog} />
                    </div>
                    <div className="p-3">
                      <p className="display text-sm font-extrabold text-[#24133f]">
                        Chog #{chog.tokenId}
                      </p>
                      {chog.name && (
                        <p className="mt-1 truncate text-[10px] text-[#766a80]">
                          {chog.name}
                        </p>
                      )}
                      {chog.tier && (
                        <p className="mt-1 text-[10px] font-semibold text-[#715795]">
                          Tier: {chog.tier}
                        </p>
                      )}
                      {chog.description && (
                        <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-[#82778c]">
                          {chog.description}
                        </p>
                      )}
                      {chog.traits?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {chog.traits.map((trait, index) => (
                            <span
                              key={`${trait.traitType}-${index}`}
                              className="max-w-full truncate rounded-full bg-[#f4effb] px-2 py-1 text-[9px] font-semibold text-[#715795]"
                            >
                              {trait.traitType}: {trait.traitValue}
                              {typeof trait.rarity === "number" &&
                                ` · ${trait.rarity}%`}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-[10px] text-[#958a9b]">
                          No trait data returned
                        </p>
                      )}
                      {chog.metadataUrl && (
                        <a
                          href={chog.metadataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[#7047ff]"
                          data-testid={`link-connected-chog-metadata-${chog.tokenId}`}
                        >
                          Metadata <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      {feedback && (
        <p
          className="mt-4 max-w-lg rounded-2xl border border-[#edc8bc] bg-[#fff2ec] px-4 py-3 text-sm leading-5 text-[#8b4232]"
          role="alert"
          data-testid="status-wallet-error"
        >
          {feedback}
        </p>
      )}
    </div>
  );
}

function safeInternalReturnTo(value?: string): string | undefined {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\r\n]/.test(value)
  ) {
    return undefined;
  }
  return value;
}
