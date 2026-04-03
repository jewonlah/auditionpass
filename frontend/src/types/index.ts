// ============================================
// 공용 타입 정의
// ============================================

export interface Profile {
  id: string;
  name: string;
  age: number;
  gender: '남성' | '여성' | '기타';
  height: number | null;
  weight: number | null;
  bio: string | null;
  photo_urls: string[];
  instagram_url: string | null;
  youtube_url: string | null;
  other_url: string | null;
  genre: string[];
  activity_field: string[];
  agency: string | null;
  specialty: string[];
  career: string | null;
  created_at: string;
  updated_at: string;
}

export interface Audition {
  id: string;
  title: string;
  company: string | null;
  genre: '배우' | '모델' | '기타';
  deadline: string | null;
  apply_email: string | null;
  description: string | null;
  requirements: string | null;
  source_url: string | null;
  source_name: string | null;
  apply_type: 'email' | 'external';
  is_active: boolean;
  crawled_at: string;
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  audition_id: string;
  email_sent: boolean;
  sent_at: string | null;
  created_at: string;
  audition?: Audition;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: 'free' | 'basic' | 'pro';
  status: 'active' | 'cancelled' | 'expired';
  started_at: string;
  expires_at: string | null;
  toss_order_id: string | null;
  created_at: string;
}

export interface DailyApplyCount {
  id: string;
  user_id: string;
  apply_date: string;
  count: number;
  ad_bonus: number;
}
