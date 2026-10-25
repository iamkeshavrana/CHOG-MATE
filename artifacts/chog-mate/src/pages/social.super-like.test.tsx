import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { SuperLikeDialog } from "./social";

const TARGET_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SENDER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const MATCH_ID = "a8b0d143-7722-4bd9-b100-095f94cd9123";
const TRANSACTION_HASH = `0x${"a".repeat(64)}` as `0x${string}`;

const mocks = vi.hoisted(() => ({
  useGetUserProfile: vi.fn(),
  refetchRecipient: vi.fn(),
  writeContractAsync: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  balanceRefetch: vi.fn(),
  connection: {
    address: "0x1111111111111111111111111111111111111111",
    isConnected: true,
    chainId: 143,
  },
}));

afterEach(() => cleanup());

vi.mock("@workspace/api-client-react", () => ({
  getGetUserProfileQueryKey: (userId: string) => ["user-profile", userId],
  useGetUserProfile: mocks.useGetUserProfile,
}));

vi.mock("wagmi", () => ({
  useConnection: () => mocks.connection,
  usePublicClient: () => ({
    waitForTransactionReceipt: mocks.waitForTransactionReceipt,
  }),
  useReadContract: ({ functionName }: { functionName: string }) =>
    functionName === "decimals"
      ? { data: 18, isLoading: false, isError: false, refetch: vi.fn() }
      : {
          data: 500n * 10n ** 18n,
          isLoading: false,
          isError: false,
          refetch: mocks.balanceRefetch,
        },
  useWriteContract: () => ({
    writeContractAsync: mocks.writeContractAsync,
    isPending: false,
  }),
}));

vi.mock("@/lib/appkit", () => ({
  monadNetwork: { id: 143 },
}));

vi.mock("@/lib/config", () => ({
  appConfig: { chogTokenAddress: "0x3333333333333333333333333333333333333333" },
}));

vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react");
  const passthrough = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children);
  return {
    Dialog: ({
      open,
      children,
    }: {
      open: boolean;
      children: React.ReactNode;
    }) => open ? React.createElement("div", { role: "dialog" }, children) : null,
    DialogContent: passthrough,
    DialogDescription: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough,
  };
});

const profile = {
  userId: TARGET_USER_ID,
  username: "selected-holder",
} as Parameters<typeof SuperLikeDialog>[0]["profile"];

function renderDialog(
  onConfirmed = vi.fn().mockResolvedValue({ matched: true, matchId: MATCH_ID }),
) {
  const rendered = render(
    <SuperLikeDialog
      profile={profile}
      walletAddress={SENDER}
      onOpenChange={vi.fn()}
      onConfirmed={onConfirmed}
    />,
  );
  return { ...rendered, onConfirmed };
}

function recipientResponse(overrides: Record<string, unknown> = {}) {
  return {
    userId: TARGET_USER_ID,
    walletVerified: true,
    walletAddress: RECIPIENT,
    ...overrides,
  };
}

describe("Super Like recipient verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.refetchRecipient.mockResolvedValue({
      data: recipientResponse(),
      isError: false,
    });
    mocks.useGetUserProfile.mockImplementation((userId: string, options: { query: { queryKey: unknown[] } }) => ({
      data: recipientResponse(),
      isError: false,
      isFetching: false,
      queryKey: options.query.queryKey,
      refetch: mocks.refetchRecipient,
    }));
    mocks.writeContractAsync.mockResolvedValue(TRANSACTION_HASH);
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    mocks.balanceRefetch.mockResolvedValue(undefined);
  });

  it("looks up the selected user, displays their verified address, then sends to the fresh address", async () => {
    renderDialog();

    expect(mocks.useGetUserProfile).toHaveBeenCalledWith(
      TARGET_USER_ID,
      expect.objectContaining({
        query: expect.objectContaining({
          queryKey: ["user-profile", TARGET_USER_ID],
        }),
      }),
    );
    expect(screen.getByTestId("text-super-like-recipient").textContent).toContain(
      getAddress(RECIPIENT),
    );

    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    await waitFor(() => expect(mocks.writeContractAsync).toHaveBeenCalledTimes(1));
    expect(mocks.refetchRecipient).toHaveBeenCalledTimes(1);
    expect(mocks.writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "transfer",
        args: [getAddress(RECIPIENT), 100n * 10n ** 18n],
      }),
    );
    expect(await screen.findByTestId("status-super-match")).toBeTruthy();
    expect(screen.getByTestId("status-super-match").textContent).toContain(
      "IT'S A SUPER MATCH! 💜",
    );
    expect(screen.getByTestId("status-super-match").textContent).toContain(
      "100 $CHOG sent successfully.",
    );
    expect(
      screen.getByTestId("link-super-match-conversation").getAttribute("href"),
    ).toBe(`/messages?match=${MATCH_ID}`);
    expect(
      screen.getByTestId("link-super-match-list").getAttribute("href"),
    ).toBe("/matches");
  });

  it.each([
    ["a profile lookup for another user", { userId: OTHER_USER_ID }],
    ["an unverified wallet", { walletVerified: false }],
    ["an invalid wallet address", { walletAddress: "not-an-address" }],
  ])("does not request a transaction for %s", async (_reason, responseOverrides) => {
    mocks.refetchRecipient.mockResolvedValue({
      data: recipientResponse(responseOverrides),
      isError: false,
    });
    renderDialog();

    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No transaction was sent.",
    );
    expect(mocks.refetchRecipient).toHaveBeenCalledTimes(1);
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
  });

  it("fails closed with a visible error when the fresh profile request fails", async () => {
    mocks.refetchRecipient.mockRejectedValue(new Error("offline"));
    renderDialog();

    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No transaction was sent.",
    );
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
  });

  it("offers transaction-hash recovery after an ambiguous wallet RPC error without resending", async () => {
    const onConfirmed = vi.fn().mockResolvedValue({ matched: true, matchId: MATCH_ID });
    mocks.writeContractAsync.mockRejectedValue(
      new Error("An unknown RPC error occurred. Request Arguments: private transaction data"),
    );
    renderDialog(onConfirmed);

    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The transfer may still have been submitted.",
    );
    expect(screen.getByRole("alert").textContent).not.toContain("private transaction data");
    expect((screen.getByTestId("button-confirm-super-like") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("button-super-like-continue-later")).toBeTruthy();

    fireEvent.change(screen.getByTestId("input-super-like-recovery-hash"), {
      target: { value: TRANSACTION_HASH },
    });
    fireEvent.click(screen.getByTestId("button-save-existing-super-like"));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(TRANSACTION_HASH));
    expect(mocks.writeContractAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Super Like sent.")).toBeTruthy();
  });

  it("treats a wallet rejection as a definite cancellation, not an ambiguous submission", async () => {
    mocks.writeContractAsync.mockRejectedValue(
      Object.assign(new Error("User rejected the request."), {
        name: "UserRejectedRequestError",
        code: 4001,
      }),
    );
    renderDialog();

    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No $CHOG transfer was sent.",
    );
    expect(screen.queryByTestId("input-super-like-recovery-hash")).toBeNull();
    expect((screen.getByTestId("button-confirm-super-like") as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the known transaction hash available if receipt checking fails", async () => {
    mocks.waitForTransactionReceipt.mockRejectedValue(
      new Error("receipt RPC unavailable"),
    );
    const onConfirmed = vi.fn().mockResolvedValue({ matched: true, matchId: MATCH_ID });
    renderDialog(onConfirmed);

    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "confirmation could not be checked",
    );
    expect(screen.getByRole("link", { name: /View transaction/ }).getAttribute("href")).toBe(
      `https://monadscan.com/tx/${TRANSACTION_HASH}`,
    );
    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(TRANSACTION_HASH));
    expect(mocks.writeContractAsync).toHaveBeenCalledTimes(1);
  });

  it("does not show payment success until the backend confirms an active match", async () => {
    const onConfirmed = vi.fn().mockResolvedValue({ matched: false, matchId: null });
    renderDialog(onConfirmed);

    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not finish saving the Super Match",
    );
    expect(screen.queryByTestId("status-super-match")).toBeNull();
    expect(screen.getByTestId("button-confirm-super-like").textContent).toContain(
      "Retry saving Super Like",
    );
    expect(mocks.writeContractAsync).toHaveBeenCalledTimes(1);
  });

  it("shows the backend recovery reason without allowing a second payment", async () => {
    const onConfirmed = vi.fn().mockRejectedValue(
      Object.assign(new Error("save failed"), {
        data: {
          code: "SUPER_LIKE_RECOVERY_FAILED",
          error: "The saved match could not be reactivated. Retry with this same transaction.",
        },
      }),
    );
    renderDialog(onConfirmed);

    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The saved match could not be reactivated. Retry with this same transaction.",
    );
    expect((screen.getByTestId("button-confirm-super-like") as HTMLButtonElement).textContent).toContain(
      "Retry saving Super Like",
    );
    fireEvent.click(screen.getByTestId("button-confirm-super-like"));
    await waitFor(() =>
      expect(onConfirmed).toHaveBeenNthCalledWith(2, TRANSACTION_HASH),
    );
    expect(mocks.writeContractAsync).toHaveBeenCalledTimes(1);
  });

  it("retries a failed database save with the same hash and never sends a second payment", async () => {
    const onConfirmed = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary database error"))
      .mockResolvedValueOnce({ matched: true, matchId: MATCH_ID });
    renderDialog(onConfirmed);

    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Retry with this same transaction",
    );
    fireEvent.click(screen.getByTestId("button-confirm-super-like"));

    expect(await screen.findByTestId("status-super-match")).toBeTruthy();
    expect(onConfirmed).toHaveBeenNthCalledWith(1, TRANSACTION_HASH);
    expect(onConfirmed).toHaveBeenNthCalledWith(2, TRANSACTION_HASH);
    expect(mocks.writeContractAsync).toHaveBeenCalledTimes(1);
  });
});
