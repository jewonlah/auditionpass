// ============================================
// 공용 타입 정의
// ============================================

export interface Profile {
  id: string;
  name: string;
  /** 출생연도 (12_ia-userflows 정본 — age를 대체, 009 마이그레이션) */
  birth_year: number | null;
  /** @deprecated birth_year로 대체 — 구 데이터 호환용 (F4에서 제거 검토) */
  age: number | null;
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
  phone: string | null;
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
  /** 심각 신고 접수 시 자동 차단 (36 §4) — 015 미적용 라이브에서는 undefined */
  oneclick_blocked?: boolean;
  /** 반려되지 않은 신고 수 — 신뢰 배지 계산용 (015) */
  reports_count?: number;
  /** 검수 상태 — 신뢰 배지 계산용 (011) */
  review_status?: 'auto' | 'pending' | 'approved' | 'rejected' | 'quarantine';
  crawled_at: string;
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  audition_id: string;
  email_sent: boolean;
  sent_at: string | null;
  /** F6 상태 모델 — R1: sent/failed, R1.2+: replied (열람은 R3 프리미엄) */
  status: 'sent' | 'failed' | 'replied';
  created_at: string;
  audition?: Audition;
}

export interface Bookmark {
  id: string;
  user_id: string;
  audition_id: string;
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

// ============================================
// 커뮤니티
// ============================================

export type CommunityCategory = '자유' | '꿀팁' | '후기' | '질문' | '구인';

export interface CommunityPost {
  id: string;
  /** 022 마이그레이션: 작성자 탈퇴 시 FK가 SET NULL — null이면 "탈퇴한 회원"으로 표시 */
  user_id: string | null;
  category: CommunityCategory;
  title: string;
  content: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  author_name?: string;
  author_photo?: string;
  has_liked?: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  /** 022 마이그레이션: 작성자 탈퇴 시 FK가 SET NULL — null이면 "탈퇴한 회원"으로 표시 */
  user_id: string | null;
  parent_id: string | null;
  content: string;
  likes_count: number;
  is_active: boolean;
  created_at: string;
  // joined
  author_name?: string;
  author_photo?: string;
  has_liked?: boolean;
  replies?: CommunityComment[];
}
