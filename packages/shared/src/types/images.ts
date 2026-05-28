export type UsageInfo = {
  used: number;
  limit: number;
  month: string;
};

export type ProcessResult = {
  result_image: string;
  usage: UsageInfo;
};

export type HistoryItem = {
  id: number;
  status: 'success' | 'error';
  error_msg: string | null;
  created_at: string;
};
