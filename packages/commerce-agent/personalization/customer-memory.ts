import type {
  CustomerProfile,
  ShoppingEvent,
} from "@commerce-agent/personalization/types";

export interface CustomerMemory {
  getProfile(
    storeId: string,
    customerId: string,
  ): Promise<CustomerProfile | null>;
  saveProfile(
    storeId: string,
    customerId: string,
    profile: CustomerProfile,
  ): Promise<void>;
  getHistory(
    storeId: string,
    customerId: string,
    limit?: number,
  ): Promise<ShoppingEvent[]>;
  recordEvent(
    event: Omit<ShoppingEvent, "id" | "createdAt"> & {
      storeId: string;
      customerId: string;
      sessionId: string;
    },
  ): Promise<void>;
}
