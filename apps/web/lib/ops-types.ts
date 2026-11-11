export interface OpsOverview { pending: number; inKitchen: number; withoutCourier: number; inDelivery: number; deliveryFailed: number; couriersOnline: number; couriersAvailable: number; couriersBusy: number; late: number; lateResponse: number; lateCourier: number; openIncidents: number }
export interface OpsOrder {
  id: string; number: string; status: string; statusLabel: string; createdAt: string; statusChangedAt: string; total: number; courierPay: number; delayMinutes: number;
  restaurant: { id: string; name: string; phone: string | null; address: string | null };
  customer: { name: string; phone: string | null };
  dropoff: { neighborhood: string; commune: string; streetLandmark: string; lat: number | null; lng: number | null };
  courier: { id: string; name: string; phone: string | null } | null;
  delivery: { id: string; status: string; offers: number; otpAttempts: number } | null;
}
export interface OpsCourier { id: string; fullName: string; phone: string | null; vehicle: string; isOnline: boolean; busy: boolean; cashHeld: number; cashLimit: number | null; overLimit: boolean; position: { lat: number; lng: number; accuracy: number | null; at: string } | null }
