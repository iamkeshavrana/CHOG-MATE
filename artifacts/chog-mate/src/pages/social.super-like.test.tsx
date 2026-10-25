import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { SuperLikeDialog } from "./social";

const TARGET_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SENDER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const TRANSACTION_HASH = `0x${"a".repeat(64)}` as `0x${string}`;

const mocks = vi.hoisted(() => ({
  useGetUserProfile: vi.fn(),
  refetchRecipient: vi.fn(),
  writeContractAsync: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  balanceRefetch: vi.fn(),
}));

afterEach(() => cleanup());

vi.mock("@workspace/api-client-react", () => ({
  getGetUserProfileQueryKey: (userId: string) => ["user-profile", userId],
  useGetUserProfile: mocks.useGetUserProfile,
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({
    address: SENDER,
    isConnected: true,
    chainId: 143,
  }),
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

function renderDialog() {
  return render(
    <SuperLikeDialog
      profile={profile}
      walletAddress={SENDER}
      onOpenChange={vi.fn()}
      onConfirmed={vi.fn().mockResolvedValue(undefined)}
    />,
  );
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
});
