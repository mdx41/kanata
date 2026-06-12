export type AdminRouteId = 'overview' | 'theme' | 'content' | 'images' | 'checks' | 'data';

export type AdminRouteDefinition = {
  id: AdminRouteId;
  href:
    | '/admin/'
    | '/admin/theme/'
    | '/admin/content/'
    | '/admin/images/'
    | '/admin/checks/'
    | '/admin/data/';
  label: string;
  description: string;
};

export const ADMIN_ROUTES = [
  {
    id: 'overview',
    href: '/admin/',
    label: '概要',
    description: 'サイトの状態'
  },
  {
    id: 'theme',
    href: '/admin/theme/',
    label: 'テーマ',
    description: 'テーマ設定'
  },
  {
    id: 'content',
    href: '/admin/content/',
    label: 'コンテンツ',
    description: 'コンテンツ索引と frontmatter 管理'
  },
  {
    id: 'images',
    href: '/admin/images/',
    label: '画像',
    description: '画像の参照とパス補助'
  },
  {
    id: 'checks',
    href: '/admin/checks/',
    label: 'チェック',
    description: '構造チェックと公開前確認'
  },
  {
    id: 'data',
    href: '/admin/data/',
    label: 'データ',
    description: '設定のインポート / エクスポート'
  }
] as const satisfies readonly AdminRouteDefinition[];

export const isAdminRouteId = (value: string): value is AdminRouteId =>
  ADMIN_ROUTES.some((route) => route.id === value);

export const getAdminRoute = (id: AdminRouteId): AdminRouteDefinition =>
  ADMIN_ROUTES.find((route) => route.id === id) ?? ADMIN_ROUTES[0];
