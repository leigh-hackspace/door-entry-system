export interface PaymentSummary {
  id: string;
  amount: string;
  charge_date: string | null;
  created_at: string;
  currency: string;
  description: string | null;
  status: string;
}
