import { isAddress } from "viem";

export const MANUAL_TEST_FLOW_KEY = "chog-mate:manual-test-flow:v1";
const MANUAL_TEST_PROFILE_KEY = "chog-mate:manual-test-profile:v1";

export interface ManualTestFlow {
  walletAddress: string;
  selectedTokenId: string;
}

export interface ManualTestProfileFields {
  displayName: string;
  username: string;
  name: string;
  age: string;
  gender: string;
  bio: string;
  location: string;
  timezone: string;
  lookingFor: string;
  interests: string;
  hobbies: string;
  skills: string;
  languages: string;
}

export interface ManualTestProfileRecord {
  walletAddress: string;
  selectedTokenId: string;
  draft: ManualTestProfileFields;
  saved: ManualTestProfileFields | null;
}

export function emptyManualTestProfileFields(): ManualTestProfileFields {
  return {
    displayName: "",
    username: "",
    name: "",
    age: "",
    gender: "",
    bio: "",
    location: "",
    timezone: "",
    lookingFor: "",
    interests: "",
    hobbies: "",
    skills: "",
    languages: "",
  };
}

export function readManualTestFlow(): ManualTestFlow | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(MANUAL_TEST_FLOW_KEY) ?? "null",
    );
    if (!isRecord(value) || typeof value.walletAddress !== "string") return null;
    if (!isAddress(value.walletAddress, { strict: false })) return null;
    const selectedTokenId =
      typeof value.selectedTokenId === "string" &&
      /^\d{1,78}$/.test(value.selectedTokenId)
        ? value.selectedTokenId
        : "";
    return {
      walletAddress: value.walletAddress.toLowerCase(),
      selectedTokenId,
    };
  } catch {
    return null;
  }
}

export function writeManualTestFlow(flow: ManualTestFlow): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    MANUAL_TEST_FLOW_KEY,
    JSON.stringify({
      walletAddress: flow.walletAddress.toLowerCase(),
      selectedTokenId: flow.selectedTokenId,
    }),
  );
}

export function clearManualTestFlow(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MANUAL_TEST_FLOW_KEY);
}

export function readManualTestProfile(
  walletAddress: string,
  selectedTokenId: string,
): ManualTestProfileRecord {
  const empty = emptyManualTestProfileFields();
  if (typeof window === "undefined") {
    return { walletAddress, selectedTokenId, draft: empty, saved: null };
  }
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(MANUAL_TEST_PROFILE_KEY) ?? "null",
    );
    if (
      !isRecord(value) ||
      typeof value.walletAddress !== "string" ||
      value.walletAddress.toLowerCase() !== walletAddress.toLowerCase() ||
      value.selectedTokenId !== selectedTokenId
    ) {
      return { walletAddress, selectedTokenId, draft: empty, saved: null };
    }
    return {
      walletAddress,
      selectedTokenId,
      draft: readFields(value.draft),
      saved: value.saved === null ? null : readFields(value.saved),
    };
  } catch {
    return { walletAddress, selectedTokenId, draft: empty, saved: null };
  }
}

export function writeManualTestProfile(record: ManualTestProfileRecord): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    MANUAL_TEST_PROFILE_KEY,
    JSON.stringify({
      ...record,
      walletAddress: record.walletAddress.toLowerCase(),
    }),
  );
}

function readFields(value: unknown): ManualTestProfileFields {
  const fields = emptyManualTestProfileFields();
  if (!isRecord(value)) return fields;
  for (const key of Object.keys(fields) as (keyof ManualTestProfileFields)[]) {
    const raw = value[key];
    if (typeof raw === "string") fields[key] = raw.slice(0, maxFieldLength(key));
  }
  return fields;
}

function maxFieldLength(key: keyof ManualTestProfileFields): number {
  if (key === "displayName") return 48;
  if (key === "username") return 24;
  if (key === "name") return 80;
  if (key === "age") return 3;
  if (key === "gender" || key === "location" || key === "timezone") return 100;
  if (key === "bio") return 500;
  return 1_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
