import { Types } from "mongoose";

/**
 * Base interface for all tenant-scoped (restaurant-owned) documents.
 */
export interface ITenantOwned {
  restaurantId: Types.ObjectId;
}

/**
 * Converts a string or ObjectId to a valid Mongoose Types.ObjectId.
 */
export const toObjectId = (id: string | Types.ObjectId): Types.ObjectId => {
  if (typeof id === "string") {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error(`Invalid ObjectId format: ${id}`);
    }
    return new Types.ObjectId(id);
  }
  return id;
};

/**
 * Wraps any query filter to strictly enforce restaurant tenant scoping.
 * Guarantees that no query can run across tenant boundaries.
 */
export function withTenant<T extends Record<string, any>>(
  restaurantId: string | Types.ObjectId,
  filter: T = {} as T
): T & { restaurantId: Types.ObjectId } {
  return {
    ...filter,
    restaurantId: toObjectId(restaurantId),
  };
}

/**
 * Wraps document creation payload with the authenticated restaurantId.
 * Guarantees that clients cannot assign arbitrary restaurant IDs.
 */
export function withTenantPayload<T extends Record<string, any>>(
  restaurantId: string | Types.ObjectId,
  payload: T
): T & { restaurantId: Types.ObjectId } {
  return {
    ...payload,
    restaurantId: toObjectId(restaurantId),
  };
}

/**
 * Asserts that a given document belongs to the authenticated tenant.
 * Throws an error if a tenant boundary violation is detected.
 */
export function assertTenantOwnership(
  resourceRestaurantId: string | Types.ObjectId,
  authenticatedRestaurantId: string | Types.ObjectId
): void {
  const resourceIdStr = resourceRestaurantId.toString();
  const authIdStr = authenticatedRestaurantId.toString();

  if (resourceIdStr !== authIdStr) {
    throw new Error(
      `Tenant Isolation Violation: Resource owned by '${resourceIdStr}' accessed by '${authIdStr}'`
    );
  }
}
