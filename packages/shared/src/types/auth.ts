export type Plan = 'free' | 'pro';

export type User = {
  id: string;
  email: string;
  plan: Plan;
};
